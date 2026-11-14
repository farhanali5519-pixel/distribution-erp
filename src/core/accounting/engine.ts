import { getDatabase } from '../database/db';
import { DEFAULT_COMPANY_ID } from '../tenancy/constants';
import { generateUUID } from '@/shared/utils/uuid';
import { AuditLogService } from '../audit/audit-log.service';
import { 
  toPaisas, 
  fromPaisas, 
  arePaisasEqual, 
  formatPaisas, 
  formatCurrency 
} from '@/shared/utils/currency';
import {
  CreateJournalEntryInput,
  JournalEntry,
  JournalLine,
  TrialBalanceRow,
  ChartOfAccount,
  EntityType,
  SubLedgerEntry,
} from './types';
import { BusinessReferenceResolver, formatBusinessReference } from './business-reference-resolver';

export class DoubleEntryEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DoubleEntryEngineError';
  }
}

/**
 * Strict Double-Entry General Ledger Engine
 * Enforces:
 * 1. Control Accounts with Sub-Ledger Entity Attribution
 * 2. Strict Integer Minor-Unit (Paisa) Precision (Zero IEEE-754 Float Drift)
 * 3. Journal Immutability & Reversal System (Audit Trail Protection)
 * 4. Tenant / Company Scoping on all journal entries, lines, accounts, and subledgers
 */
export class DoubleEntryEngine {
  /**
   * Post a balanced journal entry using exact integer Paisas
   */
  public static postEntry(input: CreateJournalEntryInput): JournalEntry {
    const db = getDatabase();
    const companyId = input.companyId || DEFAULT_COMPANY_ID;

    // 1. Validation: At least two lines required
    if (!input.lines || input.lines.length < 2) {
      throw new DoubleEntryEngineError('A double-entry journal entry must contain at least 2 lines (debit and credit).');
    }

    let totalDebitPaisas = 0;
    let totalCreditPaisas = 0;

    const validatedLines: {
      accountId: string;
      debitPaisas: number;
      creditPaisas: number;
      memo?: string | null;
      entityId?: string | null;
      entityType?: EntityType | null;
    }[] = [];

    // 2. Line verification & exact integer minor-unit conversion
    for (let i = 0; i < input.lines.length; i++) {
      const line = input.lines[i];
      const dPaisas = toPaisas(line.debit || 0);
      const cPaisas = toPaisas(line.credit || 0);

      if (dPaisas < 0 || cPaisas < 0) {
        throw new DoubleEntryEngineError(`Line ${i + 1}: Negative amounts are strictly prohibited in double-entry accounting.`);
      }

      if (dPaisas === 0 && cPaisas === 0) {
        throw new DoubleEntryEngineError(`Line ${i + 1}: Line must have either a non-zero debit or non-zero credit.`);
      }

      if (dPaisas > 0 && cPaisas > 0) {
        throw new DoubleEntryEngineError(`Line ${i + 1}: A line cannot have both debit and credit amounts.`);
      }

      // Verify account exists, belongs to THIS company, and is active
      const account = db
        .prepare('SELECT id, name, is_active FROM chart_of_accounts WHERE id = ? AND company_id = ?')
        .get(line.accountId, companyId) as { id: string; name: string; is_active: number } | undefined;

      if (!account) {
        throw new DoubleEntryEngineError(`Line ${i + 1}: Account ID "${line.accountId}" does not exist in Chart of Accounts for this company.`);
      }

      if (account.is_active !== 1) {
        throw new DoubleEntryEngineError(`Line ${i + 1}: Account "${account.name}" is deactivated and cannot receive postings.`);
      }

      totalDebitPaisas += dPaisas;
      totalCreditPaisas += cPaisas;

      validatedLines.push({
        accountId: line.accountId,
        debitPaisas: dPaisas,
        creditPaisas: cPaisas,
        memo: line.memo || null,
        entityId: line.entityId || null,
        entityType: line.entityType || null,
      });
    }

    // 3. Strict Balance Check: Exact Integer Equality (Zero Float Drift)
    if (!arePaisasEqual(totalDebitPaisas, totalCreditPaisas)) {
      throw new DoubleEntryEngineError(
        `Unbalanced Journal Entry! Total Debit (${formatPaisas(totalDebitPaisas)}) does not equal Total Credit (${formatPaisas(totalCreditPaisas)}). Variance: ${formatPaisas(Math.abs(totalDebitPaisas - totalCreditPaisas))}`
      );
    }

    // 4. Generate Unique Entry Number
    const yearMonth = new Date().toISOString().slice(0, 7).replace('-', '');
    const prefix = `JE-${yearMonth}-`;
    const lastRow = db.prepare('SELECT entry_number FROM journal_entries WHERE company_id = ? AND entry_number LIKE ? ORDER BY entry_number DESC LIMIT 1').get(companyId, `${prefix}%`) as { entry_number: string } | undefined;
    let nextSeq = 1;
    if (lastRow?.entry_number) {
      const parts = lastRow.entry_number.split('-');
      const lastNum = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastNum)) {
        nextSeq = lastNum + 1;
      }
    }
    const entryNumber = `${prefix}${String(nextSeq).padStart(4, '0')}`;
    const journalId = generateUUID();

    // 5. Execute Atomic Transaction (Savepoint enables safe nesting in outer transactions)
    db.exec('SAVEPOINT post_je_sp;');

    try {
      const insertHeader = db.prepare(`
        INSERT INTO journal_entries (
          id, company_id, entry_number, entry_date, description, source_module,
          source_document_id, status, total_amount_paisas, total_amount, created_by, sync_status, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'POSTED', ?, ?, ?, 'pending', 1)
      `);

      const totalAmountDecimal = fromPaisas(totalDebitPaisas);

      insertHeader.run(
        journalId,
        companyId,
        entryNumber,
        input.entryDate,
        input.description,
        input.sourceModule,
        input.sourceDocumentId || null,
        totalDebitPaisas,
        totalAmountDecimal,
        input.createdBy || 'system'
      );

      const insertLine = db.prepare(`
        INSERT INTO journal_lines (
          id, company_id, journal_id, account_id, debit_paisas, credit_paisas, debit, credit, entity_id, entity_type, memo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const savedLines: JournalLine[] = [];

      for (const line of validatedLines) {
        const lineId = generateUUID();
        const dDecimal = fromPaisas(line.debitPaisas);
        const cDecimal = fromPaisas(line.creditPaisas);

        insertLine.run(
          lineId,
          companyId,
          journalId,
          line.accountId,
          line.debitPaisas,
          line.creditPaisas,
          dDecimal,
          cDecimal,
          line.entityId || null,
          line.entityType || null,
          line.memo || null
        );

        savedLines.push({
          id: lineId,
          company_id: companyId,
          journal_id: journalId,
          account_id: line.accountId,
          debit: dDecimal,
          credit: cDecimal,
          debit_paisas: line.debitPaisas,
          credit_paisas: line.creditPaisas,
          entity_id: line.entityId,
          entity_type: line.entityType,
          memo: line.memo,
        });
      }

      db.exec('RELEASE post_je_sp;');

      return {
        id: journalId,
        company_id: companyId,
        entry_number: entryNumber,
        entry_date: input.entryDate,
        description: input.description,
        source_module: input.sourceModule,
        source_document_id: input.sourceDocumentId || null,
        status: 'POSTED',
        total_amount: totalAmountDecimal,
        total_amount_paisas: totalDebitPaisas,
        created_by: input.createdBy || 'system',
        sync_status: 'pending',
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        lines: savedLines,
      };
    } catch (err) {
      db.exec('ROLLBACK TO post_je_sp;');
      throw err;
    }
  }

  /**
   * Immutability Guard: Deleting POSTED or VOID journal entries is strictly prohibited
   */
  public static deleteEntry(journalId: string, companyId: string = DEFAULT_COMPANY_ID): void {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;
    const entry = db.prepare('SELECT id, entry_number, status FROM journal_entries WHERE id = ? AND company_id = ?').get(journalId, cleanCompanyId) as { id: string; entry_number: string; status: string } | undefined;

    if (!entry) {
      throw new DoubleEntryEngineError(`Journal entry ${journalId} not found.`);
    }

    if (entry.status === 'POSTED' || entry.status === 'VOID') {
      throw new DoubleEntryEngineError(
        `Audit Policy Violation: Direct DELETE of journal entry "${entry.entry_number}" (${entry.status}) is strictly prohibited. You must use voidEntry() to post an offsetting reversal voucher.`
      );
    }

    // Only DRAFT entries can be deleted
    db.prepare('DELETE FROM journal_lines WHERE journal_id = ? AND company_id = ?').run(journalId, cleanCompanyId);
    db.prepare('DELETE FROM journal_entries WHERE id = ? AND company_id = ?').run(journalId, cleanCompanyId);
  }

  /**
   * Void and Reverse an existing POSTED journal entry
   * Automatically generates a balanced reversing entry (swapping Debits and Credits)
   */
  public static voidEntry(journalId: string, reason: string, companyId: string = DEFAULT_COMPANY_ID): { originalEntry: JournalEntry; reversalEntry: JournalEntry } {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    const original = db.prepare('SELECT * FROM journal_entries WHERE id = ? AND company_id = ?').get(journalId, cleanCompanyId) as unknown as JournalEntry | undefined;
    if (!original) {
      throw new DoubleEntryEngineError(`Journal entry ${journalId} not found.`);
    }

    if (original.status !== 'POSTED') {
      throw new DoubleEntryEngineError(`Only POSTED entries can be voided. Current status is ${original.status}.`);
    }

    if (original.is_reversed === 1) {
      throw new DoubleEntryEngineError(`Journal entry "${original.entry_number}" has already been reversed.`);
    }

    // Fetch original lines
    const originalLines = db.prepare(`
      SELECT * FROM journal_lines WHERE journal_id = ? AND company_id = ?
    `).all(journalId, cleanCompanyId) as unknown as JournalLine[];

    if (originalLines.length === 0) {
      throw new DoubleEntryEngineError(`Original entry "${original.entry_number}" has no transaction lines.`);
    }

    // Prepare reversed lines: SWAP Debits and Credits
    const reversedLines = originalLines.map((l) => ({
      accountId: l.account_id,
      debit: l.credit, // SWAP
      credit: l.debit, // SWAP
      memo: `Reversal of line: ${l.memo || original.description}`,
      entityId: l.entity_id,
      entityType: l.entity_type,
    }));

    const reversalDate = new Date().toISOString().split('T')[0];

    // Post reversal entry with companyId
    const reversalEntry = this.postEntry({
      companyId: cleanCompanyId,
      entryDate: reversalDate,
      description: `Reversal of ${original.entry_number}: ${reason}`,
      sourceModule: 'reversal',
      sourceDocumentId: original.id,
      lines: reversedLines,
      createdBy: 'Reversal System',
    });

    // Mark original as VOID and link to reversal
    db.prepare(`
      UPDATE journal_entries 
      SET status = 'VOID', is_reversed = 1, reversal_of_id = ?, updated_at = datetime('now')
      WHERE id = ? AND company_id = ?
    `).run(reversalEntry.id, original.id, cleanCompanyId);

    // Link reversal back to original
    db.prepare(`
      UPDATE journal_entries
      SET reversal_of_id = ?, updated_at = datetime('now')
      WHERE id = ? AND company_id = ?
    `).run(original.id, reversalEntry.id, cleanCompanyId);

    original.status = 'VOID';
    original.is_reversed = 1;
    original.reversal_of_id = reversalEntry.id;

    return {
      originalEntry: original,
      reversalEntry,
    };
  }

  /**
   * Sub-Ledger Statement: Extracts individual customer or vendor activity from GL control accounts
   */
  public static getSubLedger(entityType: EntityType, entityId: string, companyId: string = DEFAULT_COMPANY_ID): SubLedgerEntry[] {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    const rows = db.prepare(`
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
      JOIN journal_entries je ON jl.journal_id = je.id AND jl.company_id = je.company_id
      WHERE jl.company_id = ? AND jl.entity_type = ? AND jl.entity_id = ? AND je.status = 'POSTED'
      ORDER BY je.entry_date ASC, je.created_at ASC
    `).all(cleanCompanyId, entityType, entityId) as any[];

    const resolvedRows = BusinessReferenceResolver.batchResolveSync(rows, cleanCompanyId, db);

    let runningBalancePaisas = 0;
    return resolvedRows.map((r) => {
      // For AR (Customer), Debits increase balance, Credits decrease balance
      // For AP (Vendor), Credits increase balance, Debits decrease balance
      if (entityType === 'CUSTOMER') {
        runningBalancePaisas += (r.debit_paisas - r.credit_paisas);
      } else {
        runningBalancePaisas += (r.credit_paisas - r.debit_paisas);
      }

      return {
        date: r.date,
        voucherNumber: r.businessReference || r.voucherNumber,
        entryNumber: r.voucherNumber,
        businessReference: r.businessReference,
        description: r.description,
        memo: r.memo,
        debit: r.debit,
        credit: r.credit,
        runningBalance: fromPaisas(runningBalancePaisas),
      };
    });
  }

  /**
   * Batch calculates current sub-ledger balances for all entities of a given type.
   * Avoids N+1 queries when loading customer/vendor lists.
   */
  public static getEntityBalances(
    entityType: EntityType,
    companyId: string = DEFAULT_COMPANY_ID,
    entityIds?: string[]
  ): Map<string, { balance: number; balancePaisas: number }> {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    let query = `
      SELECT 
        jl.entity_id,
        SUM(jl.debit_paisas) as total_debit,
        SUM(jl.credit_paisas) as total_credit
      FROM journal_lines jl
      JOIN journal_entries je ON jl.journal_id = je.id AND jl.company_id = je.company_id
      WHERE jl.company_id = ? AND jl.entity_type = ? AND je.status = 'POSTED'
    `;
    const params: any[] = [cleanCompanyId, entityType];

    if (entityIds && entityIds.length > 0) {
      const placeholders = entityIds.map(() => '?').join(',');
      query += ` AND jl.entity_id IN (${placeholders})`;
      params.push(...entityIds);
    }

    query += ` GROUP BY jl.entity_id`;

    const rows = db.prepare(query).all(...params) as Array<{
      entity_id: string;
      total_debit: number;
      total_credit: number;
    }>;

    const map = new Map<string, { balance: number; balancePaisas: number }>();
    for (const row of rows) {
      if (!row.entity_id) continue;
      const d = Number(row.total_debit) || 0;
      const c = Number(row.total_credit) || 0;
      const balancePaisas = entityType === 'CUSTOMER' ? (d - c) : (c - d);
      map.set(row.entity_id, {
        balancePaisas,
        balance: fromPaisas(balancePaisas),
      });
    }

    return map;
  }

  /**
   * Retrieve journal entries with line items
   */
  public static getEntries(limit: number = 50, companyId: string = DEFAULT_COMPANY_ID): JournalEntry[] {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    const rows = db.prepare(`
      SELECT * FROM journal_entries 
      WHERE company_id = ? 
      ORDER BY entry_date DESC, created_at DESC LIMIT ?
    `).all(cleanCompanyId, limit) as unknown as JournalEntry[];

    if (rows.length === 0) return [];

    const resolvedEntries = BusinessReferenceResolver.batchResolveSync(
      rows.map((r) => ({
        id: r.id,
        journalId: r.id,
        entryNumber: r.entry_number,
        sourceModule: r.source_module,
        sourceDocumentId: r.source_document_id,
        reversalOfId: r.reversal_of_id,
        description: r.description,
      })),
      cleanCompanyId,
      db
    );

    const journalIds = rows.map((r) => r.id);
    const placeholders = journalIds.map(() => '?').join(',');
    const allLines = db.prepare(`
      SELECT jl.*, coa.code as account_code, coa.name as account_name,
        COALESCE(c.name, v.name, sm.name) as entity_name
      FROM journal_lines jl
      JOIN chart_of_accounts coa ON jl.account_id = coa.id AND jl.company_id = coa.company_id
      LEFT JOIN customers c ON jl.entity_type = 'CUSTOMER' AND jl.entity_id = c.id AND jl.company_id = c.company_id
      LEFT JOIN vendors v ON jl.entity_type = 'VENDOR' AND jl.entity_id = v.id AND jl.company_id = v.company_id
      LEFT JOIN staff_members sm ON jl.entity_type = 'EMPLOYEE' AND jl.entity_id = sm.id AND jl.company_id = sm.company_id
      WHERE jl.journal_id IN (${placeholders}) AND jl.company_id = ?
      ORDER BY jl.debit_paisas DESC, jl.credit_paisas DESC
    `).all(...journalIds, cleanCompanyId) as unknown as (JournalLine & { journal_id: string })[];

    const linesByJournal = new Map<string, JournalLine[]>();
    for (const line of allLines) {
      const arr = linesByJournal.get((line as any).journal_id) || [];
      arr.push(line);
      linesByJournal.set((line as any).journal_id, arr);
    }

    for (let i = 0; i < rows.length; i++) {
      const entry = rows[i];
      entry.lines = linesByJournal.get(entry.id) || [];
      (entry as any).businessReference = resolvedEntries[i]?.businessReference;
      (entry as any).referenceDisplay = resolvedEntries[i]?.referenceDisplay;
    }

    return rows;
  }

  /**
   * Calculate Trial Balance: Sum of debits and credits using exact integer Paisas
   */
  public static getTrialBalance(companyId: string = DEFAULT_COMPANY_ID): { rows: TrialBalanceRow[]; totalDebits: number; totalCredits: number } {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    const rows = db.prepare(`
      SELECT 
        coa.id as accountId,
        coa.code,
        coa.name,
        coa.type,
        coa.normal_balance as normalBalance,
        COALESCE(sums.total_debit, 0) as totalDebitPaisas,
        COALESCE(sums.total_credit, 0) as totalCreditPaisas
      FROM chart_of_accounts coa
      LEFT JOIN (
        SELECT 
          jl.account_id,
          SUM(jl.debit_paisas) as total_debit,
          SUM(jl.credit_paisas) as total_credit
        FROM journal_lines jl
        JOIN journal_entries je ON jl.journal_id = je.id AND jl.company_id = je.company_id
        WHERE jl.company_id = ? AND je.status = 'POSTED'
        GROUP BY jl.account_id
      ) sums ON coa.id = sums.account_id
      WHERE coa.is_active = 1 AND coa.company_id = ?
      ORDER BY coa.code ASC
    `).all(cleanCompanyId, cleanCompanyId) as unknown as (TrialBalanceRow & { totalDebitPaisas: number; totalCreditPaisas: number })[];

    let totalDebitsPaisas = 0;
    let totalCreditsPaisas = 0;

    const formattedRows = rows.map((r) => {
      const dPaisas = Number(r.totalDebitPaisas) || 0;
      const cPaisas = Number(r.totalCreditPaisas) || 0;
      totalDebitsPaisas += dPaisas;
      totalCreditsPaisas += cPaisas;

      const d = fromPaisas(dPaisas);
      const c = fromPaisas(cPaisas);
      const netBalance = r.normalBalance === 'DEBIT' ? d - c : c - d;

      return {
        ...r,
        totalDebit: d,
        totalCredit: c,
        netBalance: fromPaisas(toPaisas(netBalance)),
      };
    });

    return {
      rows: formattedRows,
      totalDebits: fromPaisas(totalDebitsPaisas),
      totalCredits: fromPaisas(totalCreditsPaisas),
    };
  }

  /**
   * Get Chart of Accounts with live computed balances
   */
  public static getAccountsWithBalances(companyId: string = DEFAULT_COMPANY_ID): ChartOfAccount[] {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    const rows = db.prepare(`
      SELECT 
        coa.*,
        p.code as parent_code,
        p.name as parent_name,
        COALESCE(sums.total_debit_paisas, 0) as sum_debit_paisas,
        COALESCE(sums.total_credit_paisas, 0) as sum_credit_paisas,
        COALESCE(sums.tx_count, 0) as transaction_count,
        (SELECT COUNT(*) FROM chart_of_accounts child WHERE child.parent_id = coa.id AND child.company_id = coa.company_id) as sub_account_count
      FROM chart_of_accounts coa
      LEFT JOIN chart_of_accounts p ON coa.parent_id = p.id
      LEFT JOIN (
        SELECT 
          jl.account_id,
          SUM(jl.debit_paisas) as total_debit_paisas,
          SUM(jl.credit_paisas) as total_credit_paisas,
          COUNT(jl.id) as tx_count
        FROM journal_lines jl
        JOIN journal_entries je ON jl.journal_id = je.id AND jl.company_id = je.company_id
        WHERE jl.company_id = ? AND je.status = 'POSTED'
        GROUP BY jl.account_id
      ) sums ON coa.id = sums.account_id
      WHERE coa.company_id = ?
      ORDER BY coa.code ASC
    `).all(cleanCompanyId, cleanCompanyId) as unknown as (ChartOfAccount & { 
      sum_debit_paisas: number; 
      sum_credit_paisas: number;
      transaction_count: number;
      sub_account_count: number;
    })[];

    return rows.map((row) => {
      const dPaisas = Number(row.sum_debit_paisas) || 0;
      const cPaisas = Number(row.sum_credit_paisas) || 0;
      const netPaisas = row.normal_balance === 'DEBIT' ? dPaisas - cPaisas : cPaisas - dPaisas;
      return {
        ...row,
        total_debits: fromPaisas(dPaisas),
        total_credits: fromPaisas(cPaisas),
        total_debits_paisas: dPaisas,
        total_credits_paisas: cPaisas,
        balance: fromPaisas(netPaisas),
        balance_paisas: netPaisas,
        transaction_count: Number(row.transaction_count) || 0,
        sub_account_count: Number(row.sub_account_count) || 0,
      };
    });
  }

  /**
   * Universal DAL Async Chart of Accounts with live computed balances
   */
  public static async getAccountsWithBalancesAsync(companyId: string = DEFAULT_COMPANY_ID): Promise<ChartOfAccount[]> {
    const { DalService } = await import('../database/dal-services');
    return await DalService.getAccountsWithBalances(companyId);
  }

  /**
   * Universal DAL Async Trial Balance
   */
  public static async getTrialBalanceAsync(companyId: string = DEFAULT_COMPANY_ID): Promise<{ rows: TrialBalanceRow[]; totalDebits: number; totalCredits: number }> {
    const { DalService } = await import('../database/dal-services');
    return await DalService.getTrialBalance(companyId);
  }

  /**
   * Universal DAL Async Journal Entries
   */
  public static async getEntriesAsync(limit: number = 50, companyId: string = DEFAULT_COMPANY_ID): Promise<JournalEntry[]> {
    const { DalService } = await import('../database/dal-services');
    return await DalService.getEntries(limit, companyId);
  }

  /**
   * Universal DAL Async Subledger Entity Balances
   */
  public static async getEntityBalancesAsync(
    entityType: EntityType,
    companyId: string = DEFAULT_COMPANY_ID,
    entityIds?: string[]
  ): Promise<Map<string, { balance: number; balancePaisas: number }>> {
    const { DalService } = await import('../database/dal-services');
    return await DalService.getEntityBalances(entityType as any, companyId, entityIds);
  }


  /**
   * Get detailed Account Ledger with chronological running balance and KPI summaries
   */
  public static getAccountLedger(
    accountId: string,
    companyId: string = DEFAULT_COMPANY_ID,
    filters?: {
      search?: string;
      startDate?: string;
      endDate?: string;
      sourceModule?: string;
    }
  ) {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    const account = db.prepare(`
      SELECT coa.*, p.code as parent_code, p.name as parent_name
      FROM chart_of_accounts coa
      LEFT JOIN chart_of_accounts p ON coa.parent_id = p.id
      WHERE coa.id = ? AND coa.company_id = ?
    `).get(accountId, cleanCompanyId) as any;

    if (!account) {
      throw new DoubleEntryEngineError('Account not found.');
    }

    // 1. Fetch all posted journal lines for this account chronologically
    const allLines = db.prepare(`
      SELECT 
        je.id as journal_id,
        je.entry_number,
        je.entry_date,
        je.description as entry_description,
        je.source_module,
        je.source_document_id,
        je.reversal_of_id,
        je.is_reversed,
        jl.id as line_id,
        jl.memo,
        jl.debit,
        jl.credit,
        jl.debit_paisas,
        jl.credit_paisas,
        jl.entity_type,
        jl.entity_id,
        jl.created_at
      FROM journal_lines jl
      JOIN journal_entries je ON jl.journal_id = je.id AND jl.company_id = je.company_id
      WHERE jl.account_id = ? AND jl.company_id = ? AND je.status = 'POSTED'
      ORDER BY je.entry_date ASC, je.created_at ASC, jl.id ASC
    `).all(accountId, cleanCompanyId) as any[];

    // 2. Compute cumulative running balance for all entries
    let runningPaisas = 0;
    const isDebitNormal = account.normal_balance === 'DEBIT';

    const processedEntries = allLines.map((l) => {
      const d = Number(l.debit_paisas) || 0;
      const c = Number(l.credit_paisas) || 0;
      if (isDebitNormal) {
        runningPaisas += (d - c);
      } else {
        runningPaisas += (c - d);
      }

      return {
        id: l.line_id,
        journalId: l.journal_id,
        entryNumber: l.entry_number,
        entryDate: l.entry_date,
        sourceModule: l.source_module,
        sourceDocumentId: l.source_document_id,
        reversalOfId: l.reversal_of_id,
        description: l.memo || l.entry_description,
        memo: l.memo,
        debit: fromPaisas(d),
        credit: fromPaisas(c),
        debitPaisas: d,
        creditPaisas: c,
        runningBalance: fromPaisas(runningPaisas),
        runningBalancePaisas: runningPaisas,
      };
    });

    // 2b. Batch resolve human-readable business references (guarantees zero UUID exposure)
    const resolvedEntries = BusinessReferenceResolver.batchResolveSync(
      processedEntries,
      cleanCompanyId,
      db
    );

    const currentLiveBalancePaisas = runningPaisas;

    // 3. Apply filters (search, date range, sourceModule)
    let filteredEntries = resolvedEntries;

    if (filters?.startDate) {
      filteredEntries = filteredEntries.filter(e => e.entryDate >= filters.startDate!);
    }
    if (filters?.endDate) {
      filteredEntries = filteredEntries.filter(e => e.entryDate <= filters.endDate!);
    }
    if (filters?.sourceModule && filters.sourceModule !== 'ALL') {
      const mod = filters.sourceModule.toLowerCase();
      filteredEntries = filteredEntries.filter(e => (e.sourceModule || '').toLowerCase() === mod);
    }
    if (filters?.search && filters.search.trim()) {
      const term = filters.search.trim().toLowerCase();
      filteredEntries = filteredEntries.filter(e => 
        e.entryNumber.toLowerCase().includes(term) ||
        (e.businessReference && e.businessReference.toLowerCase().includes(term)) ||
        (e.referenceDisplay && e.referenceDisplay.toLowerCase().includes(term)) ||
        (e.description && e.description.toLowerCase().includes(term)) ||
        (e.sourceDocumentId && e.sourceDocumentId.toLowerCase().includes(term)) ||
        (e.sourceModule && e.sourceModule.toLowerCase().includes(term))
      );
    }

    // 4. Calculate filtered KPI totals
    let filteredDebitsPaisas = 0;
    let filteredCreditsPaisas = 0;
    for (const e of filteredEntries) {
      filteredDebitsPaisas += e.debitPaisas;
      filteredCreditsPaisas += e.creditPaisas;
    }

    const netFilteredPaisas = isDebitNormal
      ? filteredDebitsPaisas - filteredCreditsPaisas
      : filteredCreditsPaisas - filteredDebitsPaisas;

    return {
      account: {
        ...account,
        balance: fromPaisas(currentLiveBalancePaisas),
        balance_paisas: currentLiveBalancePaisas,
      },
      entries: filteredEntries,
      kpi: {
        currentBalance: fromPaisas(currentLiveBalancePaisas),
        currentBalancePaisas: currentLiveBalancePaisas,
        totalDebits: fromPaisas(filteredDebitsPaisas),
        totalDebitsPaisas: filteredDebitsPaisas,
        totalCredits: fromPaisas(filteredCreditsPaisas),
        totalCreditsPaisas: filteredCreditsPaisas,
        totalTransactions: filteredEntries.length,
        netBalance: fromPaisas(netFilteredPaisas),
        netBalancePaisas: netFilteredPaisas,
      },
    };
  }

  /**
   * Create account or sub-account with validation and audit logging
   */
  public static createAccount(input: {
    companyId?: string;
    code: string;
    name: string;
    type?: string;
    normal_balance?: string;
    parent_id?: string | null;
    account_group?: string | null;
    description?: string | null;
    is_active?: number;
    userId?: string;
    userName?: string;
  }): ChartOfAccount {
    const db = getDatabase();
    const companyId = input.companyId || DEFAULT_COMPANY_ID;
    const code = (input.code || '').trim();
    const name = (input.name || '').trim();

    if (!code) throw new DoubleEntryEngineError('Account code is required.');
    if (!name) throw new DoubleEntryEngineError('Account title/name is required.');

    // Check duplicate code
    const existing = db.prepare('SELECT id FROM chart_of_accounts WHERE company_id = ? AND code = ?').get(companyId, code);
    if (existing) {
      throw new DoubleEntryEngineError(`Account code "${code}" already exists.`);
    }

    let type = input.type;
    let normalBalance = input.normal_balance;
    let accountGroup = input.account_group || null;

    if (input.parent_id) {
      const parent = db.prepare('SELECT id, code, name, type, normal_balance, account_group FROM chart_of_accounts WHERE company_id = ? AND id = ?').get(companyId, input.parent_id) as any;
      if (!parent) {
        throw new DoubleEntryEngineError('Selected parent account does not exist.');
      }
      if (!type) type = parent.type;
      if (!normalBalance) normalBalance = parent.normal_balance;
      if (!accountGroup && parent.account_group) accountGroup = parent.account_group;
    }

    if (!type) {
      throw new DoubleEntryEngineError('Account type is required (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE).');
    }
    const cleanType = type.toUpperCase();
    if (!['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].includes(cleanType)) {
      throw new DoubleEntryEngineError(`Invalid account type: "${type}".`);
    }

    if (!normalBalance) {
      normalBalance = (cleanType === 'ASSET' || cleanType === 'EXPENSE') ? 'DEBIT' : 'CREDIT';
    }
    const cleanNormal = normalBalance.toUpperCase();
    if (!['DEBIT', 'CREDIT'].includes(cleanNormal)) {
      throw new DoubleEntryEngineError(`Invalid normal balance: "${normalBalance}".`);
    }

    const id = generateUUID();
    const now = new Date().toISOString();
    const isActive = input.is_active !== undefined ? Number(input.is_active) : 1;

    db.prepare(`
      INSERT INTO chart_of_accounts (
        id, company_id, code, name, type, normal_balance, parent_id,
        account_group, description, is_active, is_system, currency, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'PKR', ?, ?)
    `).run(
      id,
      companyId,
      code,
      name,
      cleanType,
      cleanNormal,
      input.parent_id || null,
      accountGroup,
      input.description || null,
      isActive,
      now,
      now
    );

    try {
      AuditLogService.logAction({
        companyId,
        userId: input.userId || 'system',
        userName: input.userName || 'System / Admin',
        action: 'CREATE_ACCOUNT',
        transactionType: 'CHART_OF_ACCOUNTS',
        transactionId: id,
        transactionNumber: code,
        reason: `Created ${input.parent_id ? 'sub-account' : 'account'} ${code} - ${name}`,
        details: { code, name, type: cleanType, normalBalance: cleanNormal, parentId: input.parent_id }
      });
    } catch (e) {
      // non-fatal
    }

    return {
      id,
      code,
      name,
      type: cleanType as any,
      normal_balance: cleanNormal as any,
      parent_id: input.parent_id || null,
      account_group: accountGroup,
      description: input.description || null,
      is_active: isActive,
      is_system: 0,
      currency: 'PKR',
      balance: 0,
      balance_paisas: 0,
      transaction_count: 0,
      sub_account_count: 0,
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * Update account title, description, active status, or account group
   */
  public static updateAccount(
    id: string,
    companyId: string = DEFAULT_COMPANY_ID,
    input: {
      name?: string;
      description?: string | null;
      account_group?: string | null;
      is_active?: number;
      userId?: string;
      userName?: string;
    }
  ) {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    const existing = db.prepare('SELECT * FROM chart_of_accounts WHERE id = ? AND company_id = ?').get(id, cleanCompanyId) as any;
    if (!existing) {
      throw new DoubleEntryEngineError('Account not found.');
    }

    const updatedName = input.name !== undefined ? input.name.trim() : existing.name;
    if (!updatedName) {
      throw new DoubleEntryEngineError('Account name cannot be empty.');
    }
    const updatedDesc = input.description !== undefined ? input.description : existing.description;
    const updatedGroup = input.account_group !== undefined ? input.account_group : existing.account_group;
    const updatedActive = input.is_active !== undefined ? Number(input.is_active) : existing.is_active;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE chart_of_accounts
      SET name = ?, description = ?, account_group = ?, is_active = ?, updated_at = ?
      WHERE id = ? AND company_id = ?
    `).run(updatedName, updatedDesc, updatedGroup, updatedActive, now, id, cleanCompanyId);

    try {
      AuditLogService.logAction({
        companyId: cleanCompanyId,
        userId: input.userId || 'system',
        userName: input.userName || 'System / Admin',
        action: existing.is_active !== updatedActive 
          ? (updatedActive === 1 ? 'ACTIVATE_ACCOUNT' : 'DEACTIVATE_ACCOUNT') 
          : 'UPDATE_ACCOUNT',
        transactionType: 'CHART_OF_ACCOUNTS',
        transactionId: id,
        transactionNumber: existing.code,
        reason: `Updated account ${existing.code} (${updatedName})`,
        details: { name: updatedName, isActive: updatedActive, group: updatedGroup }
      });
    } catch (e) {
      // non-fatal
    }

    return {
      ...existing,
      name: updatedName,
      description: updatedDesc,
      account_group: updatedGroup,
      is_active: updatedActive,
      updated_at: now,
    };
  }

  /**
   * Delete account with business safety checks
   */
  public static deleteAccount(
    id: string,
    companyId: string = DEFAULT_COMPANY_ID,
    meta?: { userId?: string; userName?: string }
  ) {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    const account = db.prepare('SELECT * FROM chart_of_accounts WHERE id = ? AND company_id = ?').get(id, cleanCompanyId) as any;
    if (!account) {
      throw new DoubleEntryEngineError('Account not found.');
    }

    // 1. System account check
    if (account.is_system === 1) {
      throw new DoubleEntryEngineError(`System account "${account.code} - ${account.name}" is protected and cannot be deleted.`);
    }

    // 2. Child accounts check
    const childRow = db.prepare('SELECT COUNT(*) as count FROM chart_of_accounts WHERE parent_id = ? AND company_id = ?').get(id, cleanCompanyId) as any;
    if (childRow && childRow.count > 0) {
      throw new DoubleEntryEngineError(`Cannot delete account "${account.code}": It has ${childRow.count} sub-account(s). Please delete or reassign them first.`);
    }

    // 3. Journal lines check
    const journalRow = db.prepare('SELECT COUNT(*) as count FROM journal_lines WHERE account_id = ? AND company_id = ?').get(id, cleanCompanyId) as any;
    if (journalRow && journalRow.count > 0) {
      throw new DoubleEntryEngineError(`Cannot delete account "${account.code}": It has ${journalRow.count} recorded journal posting(s). Deactivate this account instead to preserve ledger audit integrity.`);
    }

    db.prepare('DELETE FROM chart_of_accounts WHERE id = ? AND company_id = ?').run(id, cleanCompanyId);

    try {
      AuditLogService.logAction({
        companyId: cleanCompanyId,
        userId: meta?.userId || 'system',
        userName: meta?.userName || 'System / Admin',
        action: 'DELETE_ACCOUNT',
        transactionType: 'CHART_OF_ACCOUNTS',
        transactionId: id,
        transactionNumber: account.code,
        reason: `Deleted custom account ${account.code} - ${account.name}`,
        details: { code: account.code, name: account.name, type: account.type }
      });
    } catch (e) {
      // non-fatal
    }

    return { success: true, message: `Account ${account.code} - ${account.name} successfully deleted.` };
  }

  /**
   * Safe batch import of Chart of Accounts master data
   */
  public static importAccounts(
    rows: Array<{
      account_code?: string;
      account_name?: string;
      parent_account_code?: string;
      account_group?: string;
      account_type?: string;
      opening_balance?: string | number;
      active_status?: string | number;
    }>,
    companyId: string = DEFAULT_COMPANY_ID,
    meta?: { userId?: string; userName?: string }
  ) {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    // Load existing accounts for quick lookup
    const existingList = db.prepare('SELECT id, code, is_system FROM chart_of_accounts WHERE company_id = ?').all(cleanCompanyId) as any[];
    const codeMap = new Map<string, { id: string; is_system: number }>();
    for (const acc of existingList) {
      codeMap.set(acc.code.toLowerCase(), { id: acc.id, is_system: acc.is_system });
    }

    const results = {
      created: 0,
      skipped: 0,
      failed: 0,
      reasons: [] as Array<{
        row: number;
        code: string;
        name: string;
        status: 'CREATED' | 'SKIPPED' | 'FAILED';
        reason: string;
      }>,
    };

    const seenInBatch = new Set<string>();
    const pendingInserts: any[] = [];

    // Helper to normalize account type
    const normalizeType = (raw: string | undefined): { type: string; normal: string } | null => {
      if (!raw) return null;
      const t = raw.trim().toUpperCase();
      if (t === 'ASSET' || t.startsWith('ASSET')) return { type: 'ASSET', normal: 'DEBIT' };
      if (t === 'LIABILITY' || t.startsWith('LIABIL')) return { type: 'LIABILITY', normal: 'CREDIT' };
      if (t === 'EQUITY' || t.startsWith('EQUIT')) return { type: 'EQUITY', normal: 'CREDIT' };
      if (t === 'REVENUE' || t.startsWith('REV') || t.startsWith('INC')) return { type: 'REVENUE', normal: 'CREDIT' };
      if (t === 'EXPENSE' || t.startsWith('EXP') || t.includes('COST')) return { type: 'EXPENSE', normal: 'DEBIT' };
      return null;
    };

    for (let i = 0; i < rows.length; i++) {
      const rowIdx = i + 1;
      const r = rows[i];
      const code = (r.account_code || '').toString().trim();
      const name = (r.account_name || '').toString().trim();
      const parentCode = (r.parent_account_code || '').toString().trim();
      const group = (r.account_group || '').toString().trim() || null;
      const rawType = (r.account_type || '').toString().trim();
      const rawActive = (r.active_status || '1').toString().trim().toLowerCase();
      const isActive = rawActive === '0' || rawActive === 'false' || rawActive === 'inactive' ? 0 : 1;

      if (!code || !name) {
        results.failed++;
        results.reasons.push({
          row: rowIdx,
          code: code || '—',
          name: name || '—',
          status: 'FAILED',
          reason: 'Missing required account_code or account_name.',
        });
        continue;
      }

      const lowerCode = code.toLowerCase();

      // Check if already in DB
      if (codeMap.has(lowerCode)) {
        const item = codeMap.get(lowerCode)!;
        results.skipped++;
        results.reasons.push({
          row: rowIdx,
          code,
          name,
          status: 'SKIPPED',
          reason: item.is_system === 1 
            ? 'Protected system account already exists with this code.'
            : 'Account code already exists in Chart of Accounts.',
        });
        continue;
      }

      // Check duplicate in same batch
      if (seenInBatch.has(lowerCode)) {
        results.failed++;
        results.reasons.push({
          row: rowIdx,
          code,
          name,
          status: 'FAILED',
          reason: 'Duplicate account code within this import file.',
        });
        continue;
      }

      // Normalize Type
      let typeInfo = normalizeType(rawType);
      if (!typeInfo) {
        if (code.startsWith('1')) typeInfo = { type: 'ASSET', normal: 'DEBIT' };
        else if (code.startsWith('2')) typeInfo = { type: 'LIABILITY', normal: 'CREDIT' };
        else if (code.startsWith('3')) typeInfo = { type: 'EQUITY', normal: 'CREDIT' };
        else if (code.startsWith('4')) typeInfo = { type: 'REVENUE', normal: 'CREDIT' };
        else if (code.startsWith('5') || code.startsWith('6') || code.startsWith('7')) typeInfo = { type: 'EXPENSE', normal: 'DEBIT' };
        else {
          results.failed++;
          results.reasons.push({
            row: rowIdx,
            code,
            name,
            status: 'FAILED',
            reason: `Invalid account_type: "${rawType}". Expected ASSET, LIABILITY, EQUITY, REVENUE, or EXPENSE.`,
          });
          continue;
        }
      }

      seenInBatch.add(lowerCode);
      const newId = generateUUID();
      pendingInserts.push({
        rowIdx,
        id: newId,
        code,
        lowerCode,
        name,
        type: typeInfo.type,
        normal_balance: typeInfo.normal,
        parentCode,
        account_group: group,
        is_active: isActive,
      });

      codeMap.set(lowerCode, { id: newId, is_system: 0 });
    }

    const now = new Date().toISOString();
    const insertStmt = db.prepare(`
      INSERT INTO chart_of_accounts (
        id, company_id, code, name, type, normal_balance, parent_id,
        account_group, is_active, is_system, currency, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'PKR', ?, ?)
    `);

    for (const item of pendingInserts) {
      let parentId: string | null = null;
      if (item.parentCode) {
        const parentLower = item.parentCode.toLowerCase();
        if (codeMap.has(parentLower)) {
          parentId = codeMap.get(parentLower)!.id;
        }
      }

      insertStmt.run(
        item.id,
        cleanCompanyId,
        item.code,
        item.name,
        item.type,
        item.normal_balance,
        parentId,
        item.account_group,
        item.is_active,
        now,
        now
      );

      results.created++;
      results.reasons.push({
        row: item.rowIdx,
        code: item.code,
        name: item.name,
        status: 'CREATED',
        reason: parentId ? `Imported under parent account [${item.parentCode}].` : 'Imported successfully.',
      });
    }

    try {
      AuditLogService.logAction({
        companyId: cleanCompanyId,
        userId: meta?.userId || 'system',
        userName: meta?.userName || 'System / Admin',
        action: 'IMPORT_ACCOUNTS',
        transactionType: 'CHART_OF_ACCOUNTS',
        reason: `Batch imported ${results.created} accounts (skipped ${results.skipped}, failed ${results.failed})`,
        details: { created: results.created, skipped: results.skipped, failed: results.failed }
      });
    } catch (e) {
      // non-fatal
    }

    return results;
  }

  /**
   * Universal DAL Async Entry Posting for PostgreSQL and SQLite
   */
  public static async postEntryAsync(
    input: CreateJournalEntryInput,
    client?: import('../database/types').IDatabaseClient | import('../database/types').ITransactionClient
  ): Promise<{ journalId: string; entryNumber: string; totalAmountPaisas: number }> {
    const { DalService } = await import('../database/dal-services');
    return DalService.postJournalEntry({
      companyId: input.companyId || DEFAULT_COMPANY_ID,
      description: input.description,
      sourceModule: input.sourceModule,
      sourceDocumentId: input.sourceDocumentId,
      entryDate: input.entryDate,
      createdBy: input.createdBy,
      lines: input.lines.map((l) => ({
        accountId: l.accountId,
        debitPaisas: l.debitPaisas ?? toPaisas(l.debit || 0),
        creditPaisas: l.creditPaisas ?? toPaisas(l.credit || 0),
        memo: l.memo,
        entityType: (l.entityType ?? undefined) as string | undefined,
        entityId: (l.entityId ?? undefined) as string | undefined,
      })),
    }, client);
  }

  /**
   * Universal DAL Async Sub-Ledger for PostgreSQL and SQLite
   */
  public static async getSubLedgerAsync(
    entityType: EntityType,
    entityId: string,
    companyId: string = DEFAULT_COMPANY_ID,
    client?: import('../database/types').IDatabaseClient | import('../database/types').ITransactionClient
  ): Promise<any[]> {
    const { DalService } = await import('../database/dal-services');
    return DalService.getSubLedger(entityType, entityId, companyId, client);
  }
}
