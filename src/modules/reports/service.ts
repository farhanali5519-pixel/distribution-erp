import { getDatabase } from '@/core/database/db';
import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';
import { toPaisas, fromPaisas, arePaisasEqual } from '@/shared/utils/currency';
import { FeatureFlagService } from '@/core/settings/flags';
import { ModuleRegistry } from '@/core/registry/module-registry';
import { TenantModuleDisabledError } from '@/core/tenancy/enforcement';
import { BusinessReferenceResolver } from '@/core/accounting/business-reference-resolver';
import { formatBusinessReference } from '@/shared/utils/reference';
import {
  PartyType,
  PartyLedgerFilter,
  PartyLedgerStatement,
  PartyLedgerLine,
  ProfitAndLossStatement,
  ExpenseItem,
  StockValuationRow,
  StockValuationSummary,
  SalesmanPerformanceRow,
  SalesmanPerformanceSummary,
  StaffDistributionFilter,
  SalespersonReportRow,
  SupplyPersonReportRow,
  StaffItemReportRow,
  StaffCustomerReportRow,
  StaffTransactionReportRow,
  DistributionTeamReportSummary,
} from './types';

export class ReportsService {
  /**
   * Helper to format friendly transaction type label from source module
   */
  private static getTransactionType(sourceModule: string, description: string): string {
    const descLower = (description || '').toLowerCase();
    if (descLower.includes('credit note') || descLower.includes('sales return')) return 'Sales Return';
    if (descLower.includes('debit note') || descLower.includes('purchase return')) return 'Purchase Return';
    if (descLower.includes('cash recovery') || descLower.includes('route payment')) return 'Cash Recovery';
    if (descLower.includes('customer receipt') || descLower.includes('payment received')) return 'Payment Received';
    if (descLower.includes('spot cash')) return 'Spot Cash';
    
    switch (sourceModule) {
      case 'sales': return 'Sale Invoice';
      case 'payments': return 'Payment Received';
      case 'purchase': return 'Purchase Bill';
      case 'returns': return 'Sales Return';
      case 'expenses': return 'Expense Voucher';
      case 'closing': return 'Cash Closing';
      case 'reversal': return 'Journal Reversal';
      default: return 'General Ledger Entry';
    }
  }

  /**
   * REPORT 1: Party Khata Statement with opening & running balance
   */
  public static getPartyLedgerStatement(filter: PartyLedgerFilter): PartyLedgerStatement {
    const companyId = filter.companyId || DEFAULT_COMPANY_ID;
    if (!ModuleRegistry.isModuleEnabled('reports:ledgers', companyId)) {
      throw new TenantModuleDisabledError('reports:ledgers', companyId);
    }

    const db = getDatabase();
    const { entityType, entityId } = filter;

    const today = new Date().toISOString().split('T')[0];
    const fromDate = filter.fromDate || `${today.slice(0, 7)}-01`;
    const toDate = filter.toDate || today;

    // 1. Fetch Party Master Details
    let partyInfo: any = null;
    if (entityType === 'CUSTOMER') {
      const cust = db.prepare(`
        SELECT id, name, shop_name, contact_person, phone, address, city, cnic_or_ntn
        FROM customers WHERE id = ? AND company_id = ?
      `).get(entityId, companyId) as any;
      if (!cust) throw new Error(`Customer with ID "${entityId}" not found.`);
      partyInfo = {
        id: cust.id,
        name: cust.name,
        shopName: cust.shop_name,
        contactPerson: cust.contact_person,
        phone: cust.phone,
        address: cust.address,
        city: cust.city,
        cnicOrNtn: cust.cnic_or_ntn,
        entityType: 'CUSTOMER' as PartyType,
      };
    } else {
      const vend = db.prepare(`
        SELECT id, name, company_name, contact_person, phone, address, city, cnic_or_ntn
        FROM vendors WHERE id = ? AND company_id = ?
      `).get(entityId, companyId) as any;
      if (!vend) throw new Error(`Vendor with ID "${entityId}" not found.`);
      partyInfo = {
        id: vend.id,
        name: vend.name,
        companyName: vend.company_name,
        contactPerson: vend.contact_person,
        phone: vend.phone,
        address: vend.address,
        city: vend.city,
        cnicOrNtn: vend.cnic_or_ntn,
        entityType: 'VENDOR' as PartyType,
      };
    }

    // 2. Calculate Opening Balance before fromDate
    const opRow = db.prepare(`
      SELECT 
        COALESCE(SUM(jl.debit_paisas), 0) as op_debit_paisas,
        COALESCE(SUM(jl.credit_paisas), 0) as op_credit_paisas
      FROM journal_lines jl
      JOIN journal_entries je ON jl.journal_id = je.id AND jl.company_id = je.company_id
      WHERE jl.entity_type = ? AND jl.entity_id = ? AND je.status = 'POSTED' AND je.entry_date < ? AND jl.company_id = ?
    `).get(entityType, entityId, fromDate, companyId) as { op_debit_paisas: number; op_credit_paisas: number };

    // For Customer (1030 AR Asset): Debit increases, Credit decreases
    // For Vendor (2010 AP Liability): Credit increases, Debit decreases
    let openingBalancePaisas = 0;
    if (entityType === 'CUSTOMER') {
      openingBalancePaisas = (opRow?.op_debit_paisas || 0) - (opRow?.op_credit_paisas || 0);
    } else {
      openingBalancePaisas = (opRow?.op_credit_paisas || 0) - (opRow?.op_debit_paisas || 0);
    }

    // 3. Query chronological transaction lines between fromDate and toDate
    let formattedLines: PartyLedgerLine[] = [];
    let currentRunningPaisas = openingBalancePaisas;
    let totalDebitsPaisas = 0;
    let totalCreditsPaisas = 0;

    if (entityType === 'CUSTOMER') {
      // 3A. Customer Khata Statement:
      // Transparently display Gross Sale Bill (Debit) and Spot Cash Received (Credit) separately,
      // along with payments, returns, and other adjustments.
      const salesOrderRows = db.prepare(`
        SELECT 
          so.id,
          so.order_number,
          so.order_date,
          so.grand_total_paisas,
          so.cash_received_paisas,
          so.remaining_balance_paisas,
          so.created_at,
          so.journal_entry_id,
          je.entry_number as voucher_number,
          je.description as je_description
        FROM sales_orders so
        LEFT JOIN journal_entries je ON so.journal_entry_id = je.id AND so.company_id = je.company_id
        WHERE so.customer_id = ? AND so.company_id = ? AND so.status NOT IN ('VOID', 'CANCELLED')
          AND so.order_date >= ? AND so.order_date <= ?
      `).all(entityId, companyId, fromDate, toDate) as any[];

      const directInvoiceRows = db.prepare(`
        SELECT 
          si.id,
          si.invoice_number,
          si.invoice_date,
          si.grand_total_paisas,
          si.cash_received_paisas,
          si.remaining_balance_paisas,
          si.created_at,
          je.id as journal_entry_id,
          je.entry_number as voucher_number,
          je.description as je_description
        FROM sales_invoices si
        LEFT JOIN journal_entries je ON je.source_module = 'sales' AND je.source_document_id = si.id AND si.company_id = je.company_id
        WHERE si.customer_id = ? AND si.company_id = ? AND si.order_id IS NULL AND si.status NOT IN ('VOID', 'CANCELLED')
          AND si.invoice_date >= ? AND si.invoice_date <= ?
      `).all(entityId, companyId, fromDate, toDate) as any[];

      // Track processed journal entries and source documents to prevent duplicate AR line rows
      const processedJournalIds = new Set<string>();
      const processedDocIds = new Set<string>();

      for (const so of salesOrderRows) {
        if (so.journal_entry_id) processedJournalIds.add(so.journal_entry_id);
        if (so.id) processedDocIds.add(so.id);
      }
      for (const si of directInvoiceRows) {
        if (si.journal_entry_id) processedJournalIds.add(si.journal_entry_id);
        if (si.id) processedDocIds.add(si.id);
      }

      // Query other customer journal lines (payments, returns, adjustments)
      const otherJournalLines = db.prepare(`
        SELECT 
          je.id as journal_id,
          je.entry_date,
          je.entry_number,
          je.source_module,
          je.source_document_id,
          je.description as je_description,
          je.created_at as je_created_at,
          jl.id as line_id,
          jl.memo,
          jl.debit_paisas,
          jl.credit_paisas
        FROM journal_lines jl
        JOIN journal_entries je ON jl.journal_id = je.id AND jl.company_id = je.company_id
        WHERE jl.entity_type = 'CUSTOMER' AND jl.entity_id = ? AND je.status = 'POSTED'
          AND je.entry_date >= ? AND je.entry_date <= ? AND jl.company_id = ?
        ORDER BY je.entry_date ASC, je.created_at ASC, jl.id ASC
      `).all(entityId, fromDate, toDate, companyId) as any[];

      interface CustomerLedgerRawItem {
        date: string;
        createdAt: string;
        voucherNumber: string;
        entryNumber?: string | null;
        businessReference?: string | null;
        sourceDocumentId?: string | null;
        journalEntryId?: string | null;
        sourceModule: string;
        transactionType: string;
        description: string;
        memo: string | null;
        debitPaisas: number;
        creditPaisas: number;
        priority: number;
      }

      const items: CustomerLedgerRawItem[] = [];

      for (const so of salesOrderRows) {
        const grandTotal = Number(so.grand_total_paisas) || toPaisas(so.grand_total || 0);
        const spotCash = Number(so.cash_received_paisas) || toPaisas(so.cash_received || 0);
        const vNum = so.voucher_number || so.order_number;

        // ROW 1: Sale Invoice (Gross Bill)
        items.push({
          date: so.order_date,
          createdAt: so.created_at || so.order_date,
          voucherNumber: vNum,
          entryNumber: so.voucher_number || null,
          businessReference: so.order_number,
          sourceDocumentId: so.id,
          journalEntryId: so.journal_entry_id,
          sourceModule: 'sales',
          transactionType: 'Sale Invoice',
          description: `Sale Bill ${so.order_number}`,
          memo: so.je_description || `Sale Bill ${so.order_number}`,
          debitPaisas: grandTotal,
          creditPaisas: 0,
          priority: 1,
        });

        // ROW 2: Spot Cash Received (if any)
        if (spotCash > 0) {
          items.push({
            date: so.order_date,
            createdAt: so.created_at || so.order_date,
            voucherNumber: vNum,
            entryNumber: so.voucher_number || null,
            businessReference: so.order_number,
            sourceDocumentId: so.id,
            journalEntryId: so.journal_entry_id,
            sourceModule: 'sales',
            transactionType: 'Spot Cash',
            description: `Spot Cash Received against Sale Bill ${so.order_number}`,
            memo: `Spot Cash Received against Sale Bill ${so.order_number}`,
            debitPaisas: 0,
            creditPaisas: spotCash,
            priority: 2,
          });
        }
      }

      for (const si of directInvoiceRows) {
        const grandTotal = Number(si.grand_total_paisas) || toPaisas(si.grand_total || 0);
        const spotCash = Number(si.cash_received_paisas) || toPaisas(si.cash_received || 0);
        const vNum = si.voucher_number || si.invoice_number;

        // ROW 1: Sale Invoice (Gross Bill)
        items.push({
          date: si.invoice_date,
          createdAt: si.created_at || si.invoice_date,
          voucherNumber: vNum,
          entryNumber: si.voucher_number || null,
          businessReference: si.invoice_number,
          sourceDocumentId: si.id,
          journalEntryId: si.journal_entry_id,
          sourceModule: 'sales',
          transactionType: 'Sale Invoice',
          description: `Sale Invoice ${si.invoice_number}`,
          memo: si.je_description || `Sale Invoice ${si.invoice_number}`,
          debitPaisas: grandTotal,
          creditPaisas: 0,
          priority: 1,
        });

        // ROW 2: Spot Cash Received (if any)
        if (spotCash > 0) {
          items.push({
            date: si.invoice_date,
            createdAt: si.created_at || si.invoice_date,
            voucherNumber: vNum,
            entryNumber: si.voucher_number || null,
            businessReference: si.invoice_number,
            sourceDocumentId: si.id,
            journalEntryId: si.journal_entry_id,
            sourceModule: 'sales',
            transactionType: 'Spot Cash',
            description: `Spot Cash Received against Invoice ${si.invoice_number}`,
            memo: `Spot Cash Received against Invoice ${si.invoice_number}`,
            debitPaisas: 0,
            creditPaisas: spotCash,
            priority: 2,
          });
        }
      }

      const eligibleOtherJournalLines = otherJournalLines.filter(
        jl => !processedJournalIds.has(jl.journal_id) && !(jl.source_module === 'sales' && processedDocIds.has(jl.source_document_id))
      );

      const resolvedOtherLines = BusinessReferenceResolver.batchResolveSync(
        eligibleOtherJournalLines.map(jl => ({
          ...jl,
          journalId: jl.journal_id,
          entryNumber: jl.entry_number,
          sourceModule: jl.source_module,
          sourceDocumentId: jl.source_document_id,
          description: jl.je_description,
        })),
        companyId,
        db
      );

      for (let idx = 0; idx < eligibleOtherJournalLines.length; idx++) {
        const jl = eligibleOtherJournalLines[idx];
        const resLine = resolvedOtherLines[idx];
        const vNum = resLine?.businessReference || jl.entry_number;

        items.push({
          date: jl.entry_date,
          createdAt: jl.je_created_at || jl.entry_date,
          voucherNumber: vNum,
          entryNumber: jl.entry_number || null,
          businessReference: resLine?.businessReference || jl.entry_number,
          sourceDocumentId: jl.source_document_id || null,
          journalEntryId: jl.journal_id || null,
          sourceModule: jl.source_module,
          transactionType: this.getTransactionType(jl.source_module, jl.je_description),
          description: jl.je_description,
          memo: jl.memo || null,
          debitPaisas: Number(jl.debit_paisas) || 0,
          creditPaisas: Number(jl.credit_paisas) || 0,
          priority: 3,
        });
      }

      items.sort((a, b) => {
        if (a.date !== b.date) {
          return a.date.localeCompare(b.date);
        }
        if (a.createdAt !== b.createdAt) {
          return a.createdAt.localeCompare(b.createdAt);
        }
        return a.priority - b.priority;
      });

      formattedLines = items.map((it) => {
        totalDebitsPaisas += it.debitPaisas;
        totalCreditsPaisas += it.creditPaisas;
        currentRunningPaisas += (it.debitPaisas - it.creditPaisas);

        return {
          date: it.date,
          voucherNumber: it.voucherNumber,
          entryNumber: it.entryNumber || it.voucherNumber,
          businessReference: it.businessReference || it.voucherNumber,
          sourceModule: it.sourceModule,
          sourceDocumentId: it.sourceDocumentId || null,
          journalEntryId: it.journalEntryId || null,
          transactionType: it.transactionType,
          description: it.description,
          memo: it.memo || null,
          debit: fromPaisas(it.debitPaisas),
          credit: fromPaisas(it.creditPaisas),
          runningBalance: fromPaisas(currentRunningPaisas),
          debitPaisas: it.debitPaisas,
          creditPaisas: it.creditPaisas,
          runningBalancePaisas: currentRunningPaisas,
        };
      });
    } else {
      // 3B. Vendor Khata Statement
      const lineRows = db.prepare(`
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
        WHERE jl.entity_type = ? AND jl.entity_id = ? AND je.status = 'POSTED'
          AND je.entry_date >= ? AND je.entry_date <= ? AND jl.company_id = ?
        ORDER BY je.entry_date ASC, je.created_at ASC, jl.id ASC
      `).all(entityType, entityId, fromDate, toDate, companyId) as any[];

      const resolvedLineRows = BusinessReferenceResolver.batchResolveSync(
        lineRows,
        companyId,
        db
      );

      formattedLines = resolvedLineRows.map((r) => {
        const dPaisas = Number(r.debit_paisas) || 0;
        const cPaisas = Number(r.credit_paisas) || 0;

        totalDebitsPaisas += dPaisas;
        totalCreditsPaisas += cPaisas;
        currentRunningPaisas += (cPaisas - dPaisas);

        const vNum = r.businessReference || r.voucherNumber;

        return {
          date: r.date,
          voucherNumber: vNum,
          entryNumber: r.voucherNumber,
          businessReference: r.businessReference,
          sourceModule: r.sourceModule,
          sourceDocumentId: r.sourceDocumentId || null,
          journalEntryId: r.journalId || null,
          transactionType: this.getTransactionType(r.sourceModule, r.description),
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
    }

    return {
      party: partyInfo,
      fromDate,
      toDate,
      openingBalance: fromPaisas(openingBalancePaisas),
      openingBalancePaisas,
      totalDebits: fromPaisas(totalDebitsPaisas),
      totalCredits: fromPaisas(totalCreditsPaisas),
      closingBalance: fromPaisas(currentRunningPaisas),
      closingBalancePaisas: currentRunningPaisas,
      lines: formattedLines,
    };
  }

  /**
   * Universal DAL Async Profit & Loss Statement (Munaffa Statement)
   */
  public static async getProfitAndLossAsync(filter?: { fromDate?: string; toDate?: string; companyId?: string }): Promise<ProfitAndLossStatement> {
    const { DalService } = await import('@/core/database/dal-services');
    return (await DalService.getProfitAndLoss(filter)) as unknown as ProfitAndLossStatement;
  }

  /**
   * REPORT 2: Profit & Loss Statement (Munaffa Statement)
   */
  public static getProfitAndLoss(filter: { fromDate?: string; toDate?: string; companyId?: string }): ProfitAndLossStatement {
    const companyId = filter.companyId || DEFAULT_COMPANY_ID;
    if (!ModuleRegistry.isModuleEnabled('reports:profit_loss', companyId)) {
      throw new TenantModuleDisabledError('reports:profit_loss', companyId);
    }

    const db = getDatabase();
    const today = new Date().toISOString().split('T')[0];
    const fromDate = filter.fromDate || `${today.slice(0, 7)}-01`;
    const toDate = filter.toDate || today;

    // Fetch account totals for revenue and expense accounts during this period
    const accountRows = db.prepare(`
      SELECT 
        coa.id,
        coa.code,
        coa.name,
        coa.type,
        coa.normal_balance,
        COALESCE(SUM(jl.debit_paisas), 0) as total_debit_paisas,
        COALESCE(SUM(jl.credit_paisas), 0) as total_credit_paisas
      FROM chart_of_accounts coa
      LEFT JOIN journal_lines jl ON coa.id = jl.account_id AND coa.company_id = jl.company_id
      LEFT JOIN journal_entries je ON jl.journal_id = je.id AND je.company_id = coa.company_id AND je.status = 'POSTED'
        AND je.entry_date >= ? AND je.entry_date <= ?
      WHERE coa.type IN ('REVENUE', 'EXPENSE') AND coa.is_active = 1 AND coa.company_id = ?
      GROUP BY coa.id
      ORDER BY coa.code ASC
    `).all(fromDate, toDate, companyId) as any[];

    // 1. Trading Account (Gross Margin)
    // Gross Sales: Account 4010 (Cr - Dr)
    const row4010 = accountRows.find(r => r.code === '4010');
    const grossSalesPaisas = Math.max(0, (row4010?.total_credit_paisas || 0) - (row4010?.total_debit_paisas || 0));

    // Sales Returns: Account 4030 (Dr - Cr)
    const row4030 = accountRows.find(r => r.code === '4030');
    const salesReturnsPaisas = Math.max(0, (row4030?.total_debit_paisas || 0) - (row4030?.total_credit_paisas || 0));

    const netSalesPaisas = Math.max(0, grossSalesPaisas - salesReturnsPaisas);

    // COGS: Account 5010 (Dr - Cr)
    const row5010 = accountRows.find(r => r.code === '5010');
    const cogsPaisas = Math.max(0, (row5010?.total_debit_paisas || 0) - (row5010?.total_credit_paisas || 0));

    const grossProfitPaisas = netSalesPaisas - cogsPaisas;
    const grossMarginPercentage = netSalesPaisas > 0 ? Math.round((grossProfitPaisas / netSalesPaisas) * 1000) / 10 : 0;

    // 2. Operating Expenses Breakdown
    // All 5xxx expense accounts EXCEPT 5010 (COGS)
    const operatingExpenses: ExpenseItem[] = [];
    let totalOperatingExpensesPaisas = 0;

    for (const r of accountRows) {
      if (r.type === 'EXPENSE' && r.code !== '5010') {
        const expensePaisas = Math.max(0, (r.total_debit_paisas || 0) - (r.total_credit_paisas || 0));
        if (expensePaisas > 0) {
          totalOperatingExpensesPaisas += expensePaisas;
          const pct = netSalesPaisas > 0 ? Math.round((expensePaisas / netSalesPaisas) * 1000) / 10 : 0;
          operatingExpenses.push({
            code: r.code,
            name: r.name,
            amount: fromPaisas(expensePaisas),
            amountPaisas: expensePaisas,
            percentageOfRevenue: pct,
          });
        }
      }
    }

    // 3. Bottom Line Net Profit
    const netProfitPaisas = grossProfitPaisas - totalOperatingExpensesPaisas;
    const netMarginPercentage = netSalesPaisas > 0 ? Math.round((netProfitPaisas / netSalesPaisas) * 1000) / 10 : 0;

    return {
      fromDate,
      toDate,
      grossSales: fromPaisas(grossSalesPaisas),
      grossSalesPaisas,
      salesReturns: fromPaisas(salesReturnsPaisas),
      salesReturnsPaisas,
      netSales: fromPaisas(netSalesPaisas),
      netSalesPaisas,
      costOfGoodsSold: fromPaisas(cogsPaisas),
      costOfGoodsSoldPaisas: cogsPaisas,
      grossProfit: fromPaisas(grossProfitPaisas),
      grossProfitPaisas,
      grossMarginPercentage,
      operatingExpenses,
      totalOperatingExpenses: fromPaisas(totalOperatingExpensesPaisas),
      totalOperatingExpensesPaisas,
      netProfit: fromPaisas(netProfitPaisas),
      netProfitPaisas,
      netMarginPercentage,
    };
  }

  /**
   * REPORT 3: Stock Valuation & Godown Summary
   */
  public static getStockValuation(companyId?: string): StockValuationSummary {
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;
    if (!ModuleRegistry.isModuleEnabled('reports:stock_valuation', cleanCompanyId)) {
      throw new TenantModuleDisabledError('reports:stock_valuation', cleanCompanyId);
    }

    const db = getDatabase();

    const products = db.prepare(`
      SELECT 
        p.*,
        c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id AND c.company_id = p.company_id
      WHERE p.company_id = ?
      ORDER BY p.name ASC
    `).all(cleanCompanyId) as any[];

    let totalSellableStockValuePaisas = 0;
    let totalDamagedStockValuePaisas = 0;
    let totalSellablePieces = 0;
    let totalDamagedPieces = 0;

    const rows: StockValuationRow[] = products.map((prod) => {
      const boxesPerCarton = Math.max(1, prod.boxes_per_carton || 1);
      const piecesPerBox = Math.max(1, prod.pieces_per_box || 1);
      const totalPiecesPerCarton = Math.max(1, prod.total_pieces_per_carton || prod.bulk_conversion_factor || (boxesPerCarton * piecesPerBox));

      const currentStockBase = Math.max(0, prod.current_stock_base || 0);
      const damagedStockBase = Math.max(0, prod.damaged_stock_base || 0);

      // 3-Tier Packaging breakdown for sellable stock
      const cartonsCount = Math.floor(currentStockBase / totalPiecesPerCarton);
      const remAfterCartons = currentStockBase % totalPiecesPerCarton;
      const boxesCount = Math.floor(remAfterCartons / piecesPerBox);
      const piecesCount = remAfterCartons % piecesPerBox;

      // Base unit cost price
      const unitCostPaisas = prod.base_rate_per_piece_paisas > 0
        ? prod.base_rate_per_piece_paisas
        : Math.round((prod.cost_price_paisas || 0) / totalPiecesPerCarton);

      const sellableStockValuePaisas = currentStockBase * unitCostPaisas;
      const damagedStockValuePaisas = damagedStockBase * unitCostPaisas;
      const totalStockValuePaisas = sellableStockValuePaisas + damagedStockValuePaisas;

      totalSellableStockValuePaisas += sellableStockValuePaisas;
      totalDamagedStockValuePaisas += damagedStockValuePaisas;
      totalSellablePieces += currentStockBase;
      totalDamagedPieces += damagedStockBase;

      const minAlert = prod.min_stock_alert || 0;
      const isLowStock = minAlert > 0 && currentStockBase <= minAlert;

      return {
        productId: prod.id,
        sku: prod.sku,
        name: prod.name,
        categoryName: prod.category_name || 'General',
        boxesPerCarton,
        piecesPerBox,
        totalPiecesPerCarton,
        currentStockBase,
        cartonsCount,
        boxesCount,
        piecesCount,
        unitCost: fromPaisas(unitCostPaisas),
        unitCostPaisas,
        tradePrice: fromPaisas(prod.trade_price_paisas || 0),
        sellableStockValue: fromPaisas(sellableStockValuePaisas),
        sellableStockValuePaisas,
        damagedStockBase,
        damagedStockValue: fromPaisas(damagedStockValuePaisas),
        damagedStockValuePaisas,
        totalStockValue: fromPaisas(totalStockValuePaisas),
        totalStockValuePaisas,
        minStockAlert: minAlert,
        isLowStock,
      };
    });

    // GL Inventory Balance (Account 1040)
    const invAccountRow = db.prepare(`
      SELECT 
        COALESCE(SUM(jl.debit_paisas), 0) as dr_paisas,
        COALESCE(SUM(jl.credit_paisas), 0) as cr_paisas
      FROM chart_of_accounts coa
      JOIN journal_lines jl ON coa.id = jl.account_id AND coa.company_id = jl.company_id
      JOIN journal_entries je ON jl.journal_id = je.id AND je.company_id = coa.company_id AND je.status = 'POSTED'
      WHERE coa.code = '1040' AND coa.company_id = ?
    `).get(cleanCompanyId) as { dr_paisas: number; cr_paisas: number };

    const glInventoryPaisas = (invAccountRow?.dr_paisas || 0) - (invAccountRow?.cr_paisas || 0);
    const glInventoryBalance = fromPaisas(glInventoryPaisas);
    const varianceWithGL = fromPaisas(totalSellableStockValuePaisas - glInventoryPaisas);

    return {
      totalSellableStockValue: fromPaisas(totalSellableStockValuePaisas),
      totalSellableStockValuePaisas,
      totalDamagedStockValue: fromPaisas(totalDamagedStockValuePaisas),
      totalDamagedStockValuePaisas,
      totalCombinedStockValue: fromPaisas(totalSellableStockValuePaisas + totalDamagedStockValuePaisas),
      totalCombinedStockValuePaisas: totalSellableStockValuePaisas + totalDamagedStockValuePaisas,
      totalSellablePieces,
      totalDamagedPieces,
      glInventoryAccountBalance: glInventoryBalance,
      varianceWithGL,
      rows,
    };
  }

  /**
   * REPORT 4: Salesman & Route Recovery Performance
   */
  public static getSalesmanPerformanceReport(filter: {
    salesmanId?: string;
    routeId?: string;
    fromDate?: string;
    toDate?: string;
    companyId?: string;
  }): SalesmanPerformanceSummary {
    const companyId = filter.companyId || DEFAULT_COMPANY_ID;
    if (!ModuleRegistry.isModuleEnabled('reports:salesman_performance', companyId)) {
      throw new TenantModuleDisabledError('reports:salesman_performance', companyId);
    }

    const db = getDatabase();
    const today = new Date().toISOString().split('T')[0];
    const fromDate = filter.fromDate || `${today.slice(0, 7)}-01`;
    const toDate = filter.toDate || today;

    // Fetch staff members
    let staffQuery = "SELECT id, name, role, phone FROM staff_members WHERE role IN ('SALESMAN', 'SUPPLY_PERSON') AND is_active = 1 AND company_id = ?";
    const staffParams: any[] = [companyId];
    if (filter.salesmanId) {
      staffQuery += ' AND id = ?';
      staffParams.push(filter.salesmanId);
    }
    staffQuery += ' ORDER BY name ASC';

    const staffList = db.prepare(staffQuery).all(...staffParams) as any[];

    let overallOrders = 0;
    let overallGrossBilledPaisas = 0;
    let overallSpotCashPaisas = 0;
    let overallCreditGivenPaisas = 0;
    let overallRecoveriesPaisas = 0;
    let overallCashHandedOverPaisas = 0;

    const salesmen: SalesmanPerformanceRow[] = [];

    for (const staff of staffList) {
      // 1. Orders booked/billed by this salesman
      let orderQuery = `
        SELECT 
          COUNT(*) as orders_count,
          COALESCE(SUM(grand_total_paisas), 0) as gross_billed_paisas,
          COALESCE(SUM(cash_received_paisas), 0) as spot_cash_paisas,
          COALESCE(SUM(remaining_balance_paisas), 0) as credit_given_paisas
        FROM sales_orders
        WHERE salesman_id = ? AND status NOT IN ('VOID', 'CANCELLED')
          AND order_date >= ? AND order_date <= ? AND company_id = ?
      `;
      const orderParams: any[] = [staff.id, fromDate, toDate, companyId];
      if (filter.routeId) {
        orderQuery += ' AND route_id = ?';
        orderParams.push(filter.routeId);
      }

      const orderStats = db.prepare(orderQuery).get(...orderParams) as any;

      // 2. Customer payment recoveries collected by this salesman
      let recQuery = `
        SELECT COALESCE(SUM(amount_paisas), 0) as recovery_paisas
        FROM customer_payments
        WHERE salesman_id = ? AND payment_date >= ? AND payment_date <= ? AND company_id = ?
      `;
      const recParams: any[] = [staff.id, fromDate, toDate, companyId];
      if (filter.routeId) {
        recQuery += ' AND route_id = ?';
        recParams.push(filter.routeId);
      }

      const recStats = db.prepare(recQuery).get(...recParams) as any;

      const ordersCount = Number(orderStats?.orders_count || 0);
      const grossBilledPaisas = Number(orderStats?.gross_billed_paisas || 0);
      const spotCashPaisas = Number(orderStats?.spot_cash_paisas || 0);
      const creditGivenPaisas = Number(orderStats?.credit_given_paisas || 0);
      const recoveriesPaisas = Number(recStats?.recovery_paisas || 0);
      const totalCashHandedOverPaisas = spotCashPaisas + recoveriesPaisas;

      // Identify routes associated with this staff's customers/orders
      const routesAssigned = db.prepare(`
        SELECT DISTINCT r.name
        FROM sales_orders so
        JOIN routes r ON so.route_id = r.id AND so.company_id = r.company_id
        WHERE so.salesman_id = ? AND so.company_id = ?
        LIMIT 2
      `).all(staff.id, companyId) as { name: string }[];
      const assignedRoutesStr = routesAssigned.map(r => r.name).join(', ') || 'General / Unassigned';

      overallOrders += ordersCount;
      overallGrossBilledPaisas += grossBilledPaisas;
      overallSpotCashPaisas += spotCashPaisas;
      overallCreditGivenPaisas += creditGivenPaisas;
      overallRecoveriesPaisas += recoveriesPaisas;
      overallCashHandedOverPaisas += totalCashHandedOverPaisas;

      salesmen.push({
        salesmanId: staff.id,
        salesmanName: staff.name,
        phone: staff.phone,
        assignedRoutes: assignedRoutesStr,
        ordersCount,
        grossBilled: fromPaisas(grossBilledPaisas),
        grossBilledPaisas,
        spotCashCollected: fromPaisas(spotCashPaisas),
        spotCashCollectedPaisas: spotCashPaisas,
        creditGiven: fromPaisas(creditGivenPaisas),
        creditGivenPaisas,
        routeRecoveriesCollected: fromPaisas(recoveriesPaisas),
        routeRecoveriesCollectedPaisas: recoveriesPaisas,
        totalCashHandedOver: fromPaisas(totalCashHandedOverPaisas),
        totalCashHandedOverPaisas,
      });
    }

    return {
      fromDate,
      toDate,
      totalOrders: overallOrders,
      totalGrossBilled: fromPaisas(overallGrossBilledPaisas),
      totalSpotCash: fromPaisas(overallSpotCashPaisas),
      totalCreditGiven: fromPaisas(overallCreditGivenPaisas),
      totalRecoveries: fromPaisas(overallRecoveriesPaisas),
      totalCashHandedOver: fromPaisas(overallCashHandedOverPaisas),
      salesmen,
    };
  }

  /**
   * Complete Staff Distribution & Item-Level Performance Report
   * Full traceability across Orders, Invoices, Returns, Recoveries, and Individual Products
   */
  public static getDistributionTeamReport(filter: StaffDistributionFilter): DistributionTeamReportSummary {
    const db = getDatabase();
    const companyId = filter.companyId || DEFAULT_COMPANY_ID;
    const today = new Date().toISOString().split('T')[0];
    const fromDate = filter.fromDate || `${today.slice(0, 7)}-01`;
    const toDate = filter.toDate || today;

    // 1. Fetch Staff Master records
    const staffRows = db.prepare(`
      SELECT 
        s.id,
        s.employee_code,
        s.name,
        s.role,
        s.phone,
        r.name as route_name
      FROM staff_members s
      LEFT JOIN routes r ON s.route_id = r.id AND s.company_id = r.company_id
      WHERE s.company_id = ?
      ORDER BY s.name ASC
    `).all(companyId) as any[];

    const staffMap = new Map<string, any>();
    for (const s of staffRows) {
      staffMap.set(s.id, s);
    }

    // 2. Fetch Sales Orders
    let orderSql = `
      SELECT 
        so.id,
        so.order_number as transaction_number,
        'ORDER' as transaction_type,
        so.order_date as date,
        so.customer_id,
        c.name as customer_name,
        c.shop_name,
        so.route_id,
        r.name as route_name,
        so.salesman_id,
        COALESCE(sm.name, 'Unassigned') as salesman_name,
        COALESCE(sm.employee_code, 'UNASSIGNED') as salesman_code,
        so.supply_person_id,
        COALESCE(sp.name, 'Unassigned') as supply_person_name,
        COALESCE(sp.employee_code, 'UNASSIGNED') as supply_person_code,
        so.status,
        so.subtotal_paisas,
        so.line_discount_paisas,
        so.bill_discount_paisas,
        so.grand_total_paisas,
        so.cash_received_paisas,
        so.remaining_balance_paisas,
        (SELECT COALESCE(SUM(soi.quantity_base), 0) FROM sales_order_items soi WHERE soi.order_id = so.id AND soi.company_id = so.company_id) as quantity_base,
        (SELECT COUNT(*) FROM sales_order_items soi WHERE soi.order_id = so.id AND soi.company_id = so.company_id) as item_count
      FROM sales_orders so
      JOIN customers c ON so.customer_id = c.id AND so.company_id = c.company_id
      LEFT JOIN routes r ON so.route_id = r.id AND so.company_id = r.company_id
      LEFT JOIN staff_members sm ON so.salesman_id = sm.id AND so.company_id = sm.company_id
      LEFT JOIN staff_members sp ON so.supply_person_id = sp.id AND so.company_id = sp.company_id
      WHERE so.status NOT IN ('VOID', 'CANCELLED')
        AND so.order_date >= ? AND so.order_date <= ? AND so.company_id = ?
    `;
    const orderParams: any[] = [fromDate, toDate, companyId];

    if (filter.salesmanId) {
      orderSql += ' AND so.salesman_id = ?';
      orderParams.push(filter.salesmanId);
    }
    if (filter.supplyPersonId) {
      orderSql += ' AND so.supply_person_id = ?';
      orderParams.push(filter.supplyPersonId);
    }
    if (filter.routeId) {
      orderSql += ' AND so.route_id = ?';
      orderParams.push(filter.routeId);
    }
    if (filter.customerId) {
      orderSql += ' AND so.customer_id = ?';
      orderParams.push(filter.customerId);
    }
    if (filter.status) {
      orderSql += ' AND so.status = ?';
      orderParams.push(filter.status);
    }

    const orderRows = db.prepare(orderSql).all(...orderParams) as any[];

    // 3. Fetch Direct Sales Invoices
    let invSql = `
      SELECT 
        si.id,
        si.invoice_number as transaction_number,
        'DIRECT_SALE' as transaction_type,
        si.invoice_date as date,
        si.customer_id,
        c.name as customer_name,
        c.shop_name,
        si.route_id,
        r.name as route_name,
        si.salesman_id,
        COALESCE(sm.name, 'Unassigned') as salesman_name,
        COALESCE(sm.employee_code, 'UNASSIGNED') as salesman_code,
        si.supply_person_id,
        COALESCE(sp.name, 'Unassigned') as supply_person_name,
        COALESCE(sp.employee_code, 'UNASSIGNED') as supply_person_code,
        si.status,
        si.subtotal_paisas,
        si.line_discount_paisas,
        si.bill_discount_paisas,
        si.grand_total_paisas,
        si.cash_received_paisas,
        si.remaining_balance_paisas,
        (SELECT COALESCE(SUM(sii.quantity_base), 0) FROM sales_invoice_items sii WHERE sii.invoice_id = si.id AND sii.company_id = si.company_id) as quantity_base,
        (SELECT COUNT(*) FROM sales_invoice_items sii WHERE sii.invoice_id = si.id AND sii.company_id = si.company_id) as item_count
      FROM sales_invoices si
      JOIN customers c ON si.customer_id = c.id AND si.company_id = c.company_id
      LEFT JOIN routes r ON si.route_id = r.id AND si.company_id = r.company_id
      LEFT JOIN staff_members sm ON si.salesman_id = sm.id AND si.company_id = sm.company_id
      LEFT JOIN staff_members sp ON si.supply_person_id = sp.id AND si.company_id = sp.company_id
      WHERE si.status NOT IN ('VOID', 'CANCELLED')
        AND (si.order_id IS NULL OR si.invoice_type = 'DIRECT_SALE')
        AND si.invoice_date >= ? AND si.invoice_date <= ? AND si.company_id = ?
    `;
    const invParams: any[] = [fromDate, toDate, companyId];

    if (filter.salesmanId) {
      invSql += ' AND si.salesman_id = ?';
      invParams.push(filter.salesmanId);
    }
    if (filter.supplyPersonId) {
      invSql += ' AND si.supply_person_id = ?';
      invParams.push(filter.supplyPersonId);
    }
    if (filter.routeId) {
      invSql += ' AND si.route_id = ?';
      invParams.push(filter.routeId);
    }
    if (filter.customerId) {
      invSql += ' AND si.customer_id = ?';
      invParams.push(filter.customerId);
    }
    if (filter.status) {
      invSql += ' AND si.status = ?';
      invParams.push(filter.status);
    }

    const invRows = db.prepare(invSql).all(...invParams) as any[];

    // 4. Fetch Sales Returns
    let retSql = `
      SELECT 
        sr.id,
        sr.return_number as transaction_number,
        'RETURN' as transaction_type,
        sr.return_date as date,
        sr.customer_id,
        c.name as customer_name,
        c.shop_name,
        c.route_id,
        r.name as route_name,
        sr.salesman_id,
        COALESCE(sm.name, 'Unassigned') as salesman_name,
        COALESCE(sm.employee_code, 'UNASSIGNED') as salesman_code,
        sr.supply_person_id,
        COALESCE(sp.name, 'Unassigned') as supply_person_name,
        COALESCE(sp.employee_code, 'UNASSIGNED') as supply_person_code,
        sr.status,
        sr.subtotal_paisas,
        0 as line_discount_paisas,
        0 as bill_discount_paisas,
        sr.total_refund_paisas as grand_total_paisas,
        0 as cash_received_paisas,
        0 as remaining_balance_paisas,
        (SELECT COALESCE(SUM(sri.total_base_qty), 0) FROM sales_return_items sri WHERE sri.return_id = sr.id AND sri.company_id = sr.company_id) as quantity_base,
        (SELECT COUNT(*) FROM sales_return_items sri WHERE sri.return_id = sr.id AND sri.company_id = sr.company_id) as item_count
      FROM sales_returns sr
      JOIN customers c ON sr.customer_id = c.id AND sr.company_id = c.company_id
      LEFT JOIN routes r ON c.route_id = r.id AND c.company_id = r.company_id
      LEFT JOIN staff_members sm ON sr.salesman_id = sm.id AND sr.company_id = sm.company_id
      LEFT JOIN staff_members sp ON sr.supply_person_id = sp.id AND sr.company_id = sp.company_id
      WHERE sr.status = 'POSTED'
        AND sr.return_date >= ? AND sr.return_date <= ? AND sr.company_id = ?
    `;
    const retParams: any[] = [fromDate, toDate, companyId];

    if (filter.salesmanId) {
      retSql += ' AND sr.salesman_id = ?';
      retParams.push(filter.salesmanId);
    }
    if (filter.supplyPersonId) {
      retSql += ' AND sr.supply_person_id = ?';
      retParams.push(filter.supplyPersonId);
    }
    if (filter.customerId) {
      retSql += ' AND sr.customer_id = ?';
      retParams.push(filter.customerId);
    }

    const retRows = db.prepare(retSql).all(...retParams) as any[];

    // 5. Fetch Customer Collections (Recoveries)
    let paySql = `
      SELECT 
        cp.id,
        cp.payment_number,
        cp.payment_date,
        cp.customer_id,
        cp.route_id,
        cp.salesman_id,
        COALESCE(sm.name, 'Unassigned') as salesman_name,
        COALESCE(sm.employee_code, 'UNASSIGNED') as salesman_code,
        cp.amount_paisas
      FROM customer_payments cp
      LEFT JOIN staff_members sm ON cp.salesman_id = sm.id AND cp.company_id = sm.company_id
      WHERE cp.payment_date >= ? AND cp.payment_date <= ? AND cp.company_id = ?
    `;
    const payParams: any[] = [fromDate, toDate, companyId];
    if (filter.salesmanId) {
      paySql += ' AND cp.salesman_id = ?';
      payParams.push(filter.salesmanId);
    }
    if (filter.routeId) {
      paySql += ' AND cp.route_id = ?';
      payParams.push(filter.routeId);
    }
    if (filter.customerId) {
      paySql += ' AND cp.customer_id = ?';
      payParams.push(filter.customerId);
    }

    const payRows = db.prepare(paySql).all(...payParams) as any[];

    // 6. Fetch Item Details
    // Order Items
    let orderItemsSql = `
      SELECT 
        soi.order_id,
        soi.product_id,
        p.sku,
        p.name as product_name,
        COALESCE(c.name, 'General') as category_name,
        p.uom_base,
        p.uom_bulk,
        soi.quantity_base,
        soi.cartons_count,
        soi.loose_pieces_count,
        soi.unit_price_paisas,
        soi.discount_paisas,
        soi.line_total_paisas,
        so.salesman_id,
        COALESCE(sm.name, 'Unassigned') as salesman_name,
        COALESCE(sm.employee_code, 'UNASSIGNED') as salesman_code,
        so.supply_person_id,
        COALESCE(sp.name, 'Unassigned') as supply_person_name,
        COALESCE(sp.employee_code, 'UNASSIGNED') as supply_person_code,
        so.customer_id,
        cust.name as customer_name,
        cust.shop_name,
        r.name as route_name
      FROM sales_order_items soi
      JOIN sales_orders so ON soi.order_id = so.id AND soi.company_id = so.company_id
      JOIN customers cust ON so.customer_id = cust.id AND so.company_id = cust.company_id
      LEFT JOIN routes r ON so.route_id = r.id AND so.company_id = r.company_id
      JOIN products p ON soi.product_id = p.id AND soi.company_id = p.company_id
      LEFT JOIN categories c ON p.category_id = c.id AND p.company_id = c.company_id
      LEFT JOIN staff_members sm ON so.salesman_id = sm.id AND so.company_id = sm.company_id
      LEFT JOIN staff_members sp ON so.supply_person_id = sp.id AND so.company_id = sp.company_id
      WHERE so.status NOT IN ('VOID', 'CANCELLED')
        AND so.order_date >= ? AND so.order_date <= ? AND so.company_id = ?
    `;
    const orderItemsParams: any[] = [fromDate, toDate, companyId];

    if (filter.salesmanId) {
      orderItemsSql += ' AND so.salesman_id = ?';
      orderItemsParams.push(filter.salesmanId);
    }
    if (filter.supplyPersonId) {
      orderItemsSql += ' AND so.supply_person_id = ?';
      orderItemsParams.push(filter.supplyPersonId);
    }
    if (filter.productId) {
      orderItemsSql += ' AND soi.product_id = ?';
      orderItemsParams.push(filter.productId);
    }
    if (filter.categoryId) {
      orderItemsSql += ' AND p.category_id = ?';
      orderItemsParams.push(filter.categoryId);
    }

    const orderItems = db.prepare(orderItemsSql).all(...orderItemsParams) as any[];

    // Direct Invoice Items
    let invItemsSql = `
      SELECT 
        sii.invoice_id,
        sii.product_id,
        p.sku,
        p.name as product_name,
        COALESCE(c.name, 'General') as category_name,
        p.uom_base,
        p.uom_bulk,
        sii.quantity_base,
        sii.cartons_count,
        sii.loose_pieces_count,
        sii.unit_price_paisas,
        sii.discount_paisas,
        sii.line_total_paisas,
        si.salesman_id,
        COALESCE(sm.name, 'Unassigned') as salesman_name,
        COALESCE(sm.employee_code, 'UNASSIGNED') as salesman_code,
        si.supply_person_id,
        COALESCE(sp.name, 'Unassigned') as supply_person_name,
        COALESCE(sp.employee_code, 'UNASSIGNED') as supply_person_code,
        si.customer_id,
        cust.name as customer_name,
        cust.shop_name,
        r.name as route_name
      FROM sales_invoice_items sii
      JOIN sales_invoices si ON sii.invoice_id = si.id AND sii.company_id = si.company_id
      JOIN customers cust ON si.customer_id = cust.id AND si.company_id = cust.company_id
      LEFT JOIN routes r ON si.route_id = r.id AND si.company_id = r.company_id
      JOIN products p ON sii.product_id = p.id AND sii.company_id = p.company_id
      LEFT JOIN categories c ON p.category_id = c.id AND p.company_id = c.company_id
      LEFT JOIN staff_members sm ON si.salesman_id = sm.id AND si.company_id = sm.company_id
      LEFT JOIN staff_members sp ON si.supply_person_id = sp.id AND si.company_id = sp.company_id
      WHERE si.status NOT IN ('VOID', 'CANCELLED')
        AND (si.order_id IS NULL OR si.invoice_type = 'DIRECT_SALE')
        AND si.invoice_date >= ? AND si.invoice_date <= ? AND si.company_id = ?
    `;
    const invItemsParams: any[] = [fromDate, toDate, companyId];

    if (filter.salesmanId) {
      invItemsSql += ' AND si.salesman_id = ?';
      invItemsParams.push(filter.salesmanId);
    }
    if (filter.supplyPersonId) {
      invItemsSql += ' AND si.supply_person_id = ?';
      invItemsParams.push(filter.supplyPersonId);
    }
    if (filter.productId) {
      invItemsSql += ' AND sii.product_id = ?';
      invItemsParams.push(filter.productId);
    }
    if (filter.categoryId) {
      invItemsSql += ' AND p.category_id = ?';
      invItemsParams.push(filter.categoryId);
    }

    const invItems = db.prepare(invItemsSql).all(...invItemsParams) as any[];

    // Return Items
    let retItemsSql = `
      SELECT 
        sri.return_id,
        sri.product_id,
        p.sku,
        p.name as product_name,
        COALESCE(c.name, 'General') as category_name,
        p.uom_base,
        p.uom_bulk,
        sri.total_base_qty as quantity_base,
        sri.cartons_qty as cartons_count,
        sri.pieces_qty as loose_pieces_count,
        sri.unit_rate_paisas as unit_price_paisas,
        0 as discount_paisas,
        sri.line_total_paisas,
        sr.salesman_id,
        COALESCE(sm.name, 'Unassigned') as salesman_name,
        COALESCE(sm.employee_code, 'UNASSIGNED') as salesman_code,
        sr.supply_person_id,
        COALESCE(sp.name, 'Unassigned') as supply_person_name,
        COALESCE(sp.employee_code, 'UNASSIGNED') as supply_person_code,
        sr.customer_id,
        cust.name as customer_name,
        cust.shop_name,
        r.name as route_name
      FROM sales_return_items sri
      JOIN sales_returns sr ON sri.return_id = sr.id AND sri.company_id = sr.company_id
      JOIN customers cust ON sr.customer_id = cust.id AND sr.company_id = cust.company_id
      LEFT JOIN routes r ON cust.route_id = r.id AND cust.company_id = r.company_id
      JOIN products p ON sri.product_id = p.id AND sri.company_id = p.company_id
      LEFT JOIN categories c ON p.category_id = c.id AND p.company_id = c.company_id
      LEFT JOIN staff_members sm ON sr.salesman_id = sm.id AND sr.company_id = sm.company_id
      LEFT JOIN staff_members sp ON sr.supply_person_id = sp.id AND sr.company_id = sp.company_id
      WHERE sr.status = 'POSTED'
        AND sr.return_date >= ? AND sr.return_date <= ? AND sr.company_id = ?
    `;
    const retItemsParams: any[] = [fromDate, toDate, companyId];

    if (filter.salesmanId) {
      retItemsSql += ' AND sr.salesman_id = ?';
      retItemsParams.push(filter.salesmanId);
    }
    if (filter.supplyPersonId) {
      retItemsSql += ' AND sr.supply_person_id = ?';
      retItemsParams.push(filter.supplyPersonId);
    }
    if (filter.productId) {
      retItemsSql += ' AND sri.product_id = ?';
      retItemsParams.push(filter.productId);
    }
    if (filter.categoryId) {
      retItemsSql += ' AND p.category_id = ?';
      retItemsParams.push(filter.categoryId);
    }

    const retItems = db.prepare(retItemsSql).all(...retItemsParams) as any[];

    // 7. Aggregate Salesperson Rows
    // Find all salesman IDs across orders, invoices, returns, payments, and staff master
    const salespersonIds = new Set<string>();
    for (const s of staffRows) {
      if (s.role === 'SALESMAN' || s.role === 'BOTH') salespersonIds.add(s.id);
    }
    for (const o of orderRows) if (o.salesman_id) salespersonIds.add(o.salesman_id);
    for (const i of invRows) if (i.salesman_id) salespersonIds.add(i.salesman_id);
    for (const r of retRows) if (r.salesman_id) salespersonIds.add(r.salesman_id);
    for (const p of payRows) if (p.salesman_id) salespersonIds.add(p.salesman_id);

    // Also check for unassigned sales
    const hasUnassignedSales = orderRows.some((o) => !o.salesman_id) || invRows.some((i) => !i.salesman_id);
    if (hasUnassignedSales) {
      salespersonIds.add('__UNASSIGNED__');
    }

    const salespersonRows: SalespersonReportRow[] = [];

    for (const sId of Array.from(salespersonIds)) {
      const isUnassigned = sId === '__UNASSIGNED__';
      const staffInfo = !isUnassigned ? staffMap.get(sId) : null;

      const staffName = isUnassigned ? 'Unassigned Salesperson' : (staffInfo?.name || 'Unknown Staff');
      const employeeCode = isUnassigned ? 'UNASSIGNED' : (staffInfo?.employee_code || 'EMP-N/A');
      const phone = staffInfo?.phone || null;
      const role = staffInfo?.role || 'SALESMAN';
      const assignedRoute = staffInfo?.route_name || 'General';

      // Orders for this salesman
      const sOrders = orderRows.filter((o) => isUnassigned ? !o.salesman_id : o.salesman_id === sId);
      const sInvoices = invRows.filter((i) => isUnassigned ? !i.salesman_id : i.salesman_id === sId);
      const sReturns = retRows.filter((r) => isUnassigned ? !r.salesman_id : r.salesman_id === sId);
      const sPayments = payRows.filter((p) => isUnassigned ? !p.salesman_id : p.salesman_id === sId);

      const ordersCount = sOrders.length;
      const invoicesCount = sInvoices.length;

      let quantitySoldBase = 0;
      let grossSalesPaisas = 0;
      let lineDiscountPaisas = 0;
      let billDiscountPaisas = 0;
      let netSalesPaisas = 0;
      let spotCashCollectedPaisas = 0;

      for (const o of sOrders) {
        quantitySoldBase += Number(o.quantity_base || 0);
        grossSalesPaisas += Number(o.subtotal_paisas || 0);
        lineDiscountPaisas += Number(o.line_discount_paisas || 0);
        billDiscountPaisas += Number(o.bill_discount_paisas || 0);
        netSalesPaisas += Number(o.grand_total_paisas || 0);
        spotCashCollectedPaisas += Number(o.cash_received_paisas || 0);
      }

      for (const inv of sInvoices) {
        quantitySoldBase += Number(inv.quantity_base || 0);
        grossSalesPaisas += Number(inv.subtotal_paisas || 0);
        lineDiscountPaisas += Number(inv.line_discount_paisas || 0);
        billDiscountPaisas += Number(inv.bill_discount_paisas || 0);
        netSalesPaisas += Number(inv.grand_total_paisas || 0);
        spotCashCollectedPaisas += Number(inv.cash_received_paisas || 0);
      }

      const totalDiscountPaisas = lineDiscountPaisas + billDiscountPaisas;

      let returnsCount = sReturns.length;
      let returnsQuantityBase = 0;
      let returnsAmountPaisas = 0;

      for (const r of sReturns) {
        returnsQuantityBase += Number(r.quantity_base || 0);
        returnsAmountPaisas += Number(r.grand_total_paisas || 0);
      }

      const netAfterReturnsPaisas = Math.max(0, netSalesPaisas - returnsAmountPaisas);

      let collectionsPaisas = 0;
      for (const p of sPayments) {
        collectionsPaisas += Number(p.amount_paisas || 0);
      }

      const totalLiquidityCollectedPaisas = spotCashCollectedPaisas + collectionsPaisas;

      salespersonRows.push({
        staffId: isUnassigned ? null : sId,
        employeeCode,
        staffName,
        phone,
        role,
        assignedRoute,
        ordersCount,
        invoicesCount,
        quantitySoldBase,
        grossSalesPaisas,
        grossSales: fromPaisas(grossSalesPaisas),
        lineDiscountPaisas,
        billDiscountPaisas,
        totalDiscountPaisas,
        totalDiscount: fromPaisas(totalDiscountPaisas),
        netSalesPaisas,
        netSales: fromPaisas(netSalesPaisas),
        returnsCount,
        returnsQuantityBase,
        returnsAmountPaisas,
        returnsAmount: fromPaisas(returnsAmountPaisas),
        netAfterReturnsPaisas,
        netAfterReturns: fromPaisas(netAfterReturnsPaisas),
        netSalesAfterReturns: fromPaisas(netAfterReturnsPaisas),
        collectionsPaisas,
        collections: fromPaisas(collectionsPaisas),
        spotCashCollectedPaisas,
        spotCashCollected: fromPaisas(spotCashCollectedPaisas),
        totalLiquidityCollectedPaisas,
        totalLiquidityCollected: fromPaisas(totalLiquidityCollectedPaisas),
      });
    }

    // Sort: highest sales first, unassigned at bottom
    salespersonRows.sort((a, b) => {
      if (!a.staffId) return 1;
      if (!b.staffId) return -1;
      return b.netSalesPaisas - a.netSalesPaisas;
    });

    // 8. Aggregate Supply Person Rows
    const supplyPersonIds = new Set<string>();
    for (const s of staffRows) {
      if (s.role === 'SUPPLY_PERSON' || s.role === 'BOTH' || s.role === 'DRIVER') {
        supplyPersonIds.add(s.id);
      }
    }
    for (const o of orderRows) if (o.supply_person_id) supplyPersonIds.add(o.supply_person_id);
    for (const i of invRows) if (i.supply_person_id) supplyPersonIds.add(i.supply_person_id);
    for (const r of retRows) if (r.supply_person_id) supplyPersonIds.add(r.supply_person_id);

    const hasUnassignedDeliveries = orderRows.some((o) => !o.supply_person_id) || invRows.some((i) => !i.supply_person_id);
    if (hasUnassignedDeliveries) {
      supplyPersonIds.add('__UNASSIGNED__');
    }

    const supplyPersonRows: SupplyPersonReportRow[] = [];

    for (const spId of Array.from(supplyPersonIds)) {
      const isUnassigned = spId === '__UNASSIGNED__';
      const staffInfo = !isUnassigned ? staffMap.get(spId) : null;

      const staffName = isUnassigned ? 'Unassigned Delivery Officer' : (staffInfo?.name || 'Unknown Officer');
      const employeeCode = isUnassigned ? 'UNASSIGNED' : (staffInfo?.employee_code || 'EMP-N/A');
      const phone = staffInfo?.phone || null;
      const role = staffInfo?.role || 'SUPPLY_PERSON';
      const assignedRoute = staffInfo?.route_name || 'General';

      const spOrders = orderRows.filter((o) => isUnassigned ? !o.supply_person_id : o.supply_person_id === spId);
      const spInvoices = invRows.filter((i) => isUnassigned ? !i.supply_person_id : i.supply_person_id === spId);
      const spReturns = retRows.filter((r) => isUnassigned ? !r.supply_person_id : r.supply_person_id === spId);

      const ordersDeliveredCount = spOrders.length;
      const invoicesCount = spInvoices.length;

      let quantityDeliveredBase = 0;
      let deliveryAmountPaisas = 0;
      const routesServicedSet = new Set<string>();
      const customersServedSet = new Set<string>();

      for (const o of spOrders) {
        quantityDeliveredBase += Number(o.quantity_base || 0);
        deliveryAmountPaisas += Number(o.grand_total_paisas || 0);
        if (o.route_name) routesServicedSet.add(o.route_name);
        if (o.customer_id) customersServedSet.add(o.customer_id);
      }

      for (const inv of spInvoices) {
        quantityDeliveredBase += Number(inv.quantity_base || 0);
        deliveryAmountPaisas += Number(inv.grand_total_paisas || 0);
        if (inv.route_name) routesServicedSet.add(inv.route_name);
        if (inv.customer_id) customersServedSet.add(inv.customer_id);
      }

      let returnsCount = spReturns.length;
      let returnsQuantityBase = 0;
      let returnsAmountPaisas = 0;

      for (const r of spReturns) {
        returnsQuantityBase += Number(r.quantity_base || 0);
        returnsAmountPaisas += Number(r.grand_total_paisas || 0);
      }

      supplyPersonRows.push({
        staffId: isUnassigned ? null : spId,
        employeeCode,
        staffName,
        phone,
        role,
        assignedRoute,
        ordersDeliveredCount,
        invoicesCount,
        quantityDeliveredBase,
        cartonsDelivered: Math.floor(quantityDeliveredBase / 24), // standard carton index
        deliveryAmountPaisas,
        deliveryAmount: fromPaisas(deliveryAmountPaisas),
        returnsCount,
        returnsQuantityBase,
        returnsAmountPaisas,
        returnsAmount: fromPaisas(returnsAmountPaisas),
        routesServiced: Array.from(routesServicedSet).join(', ') || assignedRoute,
        customersServedCount: customersServedSet.size,
      });
    }

    supplyPersonRows.sort((a, b) => {
      if (!a.staffId) return 1;
      if (!b.staffId) return -1;
      return b.deliveryAmountPaisas - a.deliveryAmountPaisas;
    });

    // 9. Aggregate Item-Level Reporting (The Ali Example)
    // Map key: `${staffId || 'UNASSIGNED'}_${roleType}_${productId}`
    const itemMap = new Map<string, {
      staffId: string | null;
      staffName: string;
      employeeCode: string;
      staffRoleType: 'SALESPERSON' | 'SUPPLY_PERSON';
      productId: string;
      sku: string;
      productName: string;
      categoryName: string;
      uomBase: string;
      uomBulk: string;
      quantitySoldBase: number;
      cartonsSold: number;
      loosePiecesSold: number;
      grossAmountPaisas: number;
      discountPaisas: number;
      netAmountPaisas: number;
      returnsQuantityBase: number;
      returnsAmountPaisas: number;
    }>();

    // Helper to add or create item row
    const addItemRecord = (
      staffId: string | null,
      staffName: string,
      employeeCode: string,
      roleType: 'SALESPERSON' | 'SUPPLY_PERSON',
      item: any,
      isReturn = false
    ) => {
      const key = `${staffId || 'UNASSIGNED'}_${roleType}_${item.product_id}`;
      let existing = itemMap.get(key);
      if (!existing) {
        existing = {
          staffId,
          staffName,
          employeeCode,
          staffRoleType: roleType,
          productId: item.product_id,
          sku: item.sku || 'N/A',
          productName: item.product_name || 'Product',
          categoryName: item.category_name || 'General',
          uomBase: item.uom_base || 'PCS',
          uomBulk: item.uom_bulk || 'CTN',
          quantitySoldBase: 0,
          cartonsSold: 0,
          loosePiecesSold: 0,
          grossAmountPaisas: 0,
          discountPaisas: 0,
          netAmountPaisas: 0,
          returnsQuantityBase: 0,
          returnsAmountPaisas: 0,
        };
        itemMap.set(key, existing);
      }

      if (isReturn) {
        existing.returnsQuantityBase += Number(item.quantity_base || 0);
        existing.returnsAmountPaisas += Number(item.line_total_paisas || 0);
      } else {
        existing.quantitySoldBase += Number(item.quantity_base || 0);
        existing.cartonsSold += Number(item.cartons_count || 0);
        existing.loosePiecesSold += Number(item.loose_pieces_count || 0);
        const lineGross = Number(item.quantity_base || 0) * Number(item.unit_price_paisas || 0);
        existing.grossAmountPaisas += lineGross > 0 ? lineGross : Number(item.line_total_paisas || 0);
        existing.discountPaisas += Number(item.discount_paisas || 0);
        existing.netAmountPaisas += Number(item.line_total_paisas || 0);
      }
    };

    // Populate Salesperson Item Records
    for (const itm of orderItems) {
      addItemRecord(itm.salesman_id, itm.salesman_name, itm.salesman_code, 'SALESPERSON', itm, false);
    }
    for (const itm of invItems) {
      addItemRecord(itm.salesman_id, itm.salesman_name, itm.salesman_code, 'SALESPERSON', itm, false);
    }
    for (const itm of retItems) {
      addItemRecord(itm.salesman_id, itm.salesman_name, itm.salesman_code, 'SALESPERSON', itm, true);
    }

    // Populate Supply Person Item Records
    for (const itm of orderItems) {
      addItemRecord(itm.supply_person_id, itm.supply_person_name, itm.supply_person_code, 'SUPPLY_PERSON', itm, false);
    }
    for (const itm of invItems) {
      addItemRecord(itm.supply_person_id, itm.supply_person_name, itm.supply_person_code, 'SUPPLY_PERSON', itm, false);
    }
    for (const itm of retItems) {
      addItemRecord(itm.supply_person_id, itm.supply_person_name, itm.supply_person_code, 'SUPPLY_PERSON', itm, true);
    }

    const itemRows: StaffItemReportRow[] = Array.from(itemMap.values()).map((row) => {
      const netDeliveredQuantityBase = Math.max(0, row.quantitySoldBase - row.returnsQuantityBase);
      const netDeliveredAmountPaisas = Math.max(0, row.netAmountPaisas - row.returnsAmountPaisas);
      return {
        ...row,
        grossAmount: fromPaisas(row.grossAmountPaisas),
        discount: fromPaisas(row.discountPaisas),
        netAmount: fromPaisas(row.netAmountPaisas),
        returnsAmount: fromPaisas(row.returnsAmountPaisas),
        netDeliveredQuantityBase,
        netDeliveredAmountPaisas,
        netDeliveredAmount: fromPaisas(netDeliveredAmountPaisas),
      };
    });

    itemRows.sort((a, b) => b.netAmountPaisas - a.netAmountPaisas);

    // 10. Aggregate Customer Rows
    const custMap = new Map<string, {
      staffId: string | null;
      staffName: string;
      employeeCode: string;
      staffRoleType: 'SALESPERSON' | 'SUPPLY_PERSON';
      customerId: string;
      customerName: string;
      shopName: string | null;
      routeName: string | null;
      ordersCount: number;
      quantityBase: number;
      netSalesPaisas: number;
      returnsPaisas: number;
      collectionsPaisas: number;
    }>();

    for (const o of orderRows) {
      const key = `${o.salesman_id || 'UNASSIGNED'}_${o.customer_id}`;
      let cEntry = custMap.get(key);
      if (!cEntry) {
        cEntry = {
          staffId: o.salesman_id,
          staffName: o.salesman_name,
          employeeCode: o.salesman_code,
          staffRoleType: 'SALESPERSON',
          customerId: o.customer_id,
          customerName: o.customer_name,
          shopName: o.shop_name,
          routeName: o.route_name,
          ordersCount: 0,
          quantityBase: 0,
          netSalesPaisas: 0,
          returnsPaisas: 0,
          collectionsPaisas: 0,
        };
        custMap.set(key, cEntry);
      }
      cEntry.ordersCount += 1;
      cEntry.quantityBase += Number(o.quantity_base || 0);
      cEntry.netSalesPaisas += Number(o.grand_total_paisas || 0);
    }

    for (const inv of invRows) {
      const key = `${inv.salesman_id || 'UNASSIGNED'}_${inv.customer_id}`;
      let cEntry = custMap.get(key);
      if (!cEntry) {
        cEntry = {
          staffId: inv.salesman_id,
          staffName: inv.salesman_name,
          employeeCode: inv.salesman_code,
          staffRoleType: 'SALESPERSON',
          customerId: inv.customer_id,
          customerName: inv.customer_name,
          shopName: inv.shop_name,
          routeName: inv.route_name,
          ordersCount: 0,
          quantityBase: 0,
          netSalesPaisas: 0,
          returnsPaisas: 0,
          collectionsPaisas: 0,
        };
        custMap.set(key, cEntry);
      }
      cEntry.ordersCount += 1;
      cEntry.quantityBase += Number(inv.quantity_base || 0);
      cEntry.netSalesPaisas += Number(inv.grand_total_paisas || 0);
    }

    for (const r of retRows) {
      const key = `${r.salesman_id || 'UNASSIGNED'}_${r.customer_id}`;
      let cEntry = custMap.get(key);
      if (cEntry) {
        cEntry.returnsPaisas += Number(r.grand_total_paisas || 0);
      }
    }

    for (const p of payRows) {
      const key = `${p.salesman_id || 'UNASSIGNED'}_${p.customer_id}`;
      let cEntry = custMap.get(key);
      if (cEntry) {
        cEntry.collectionsPaisas += Number(p.amount_paisas || 0);
      }
    }

    const customerRows: StaffCustomerReportRow[] = Array.from(custMap.values()).map((row) => {
      const netAfterReturnsPaisas = Math.max(0, row.netSalesPaisas - row.returnsPaisas);
      return {
        ...row,
        netSales: fromPaisas(row.netSalesPaisas),
        returns: fromPaisas(row.returnsPaisas),
        netAfterReturnsPaisas,
        netAfterReturns: fromPaisas(netAfterReturnsPaisas),
        collections: fromPaisas(row.collectionsPaisas),
      };
    });

    customerRows.sort((a, b) => b.netSalesPaisas - a.netSalesPaisas);

    // 11. Transaction Rows
    const transactionRows: StaffTransactionReportRow[] = [
      ...orderRows.map((o) => ({
        id: o.id,
        transactionNumber: o.transaction_number,
        transactionType: 'ORDER' as const,
        date: o.date,
        customerId: o.customer_id,
        customerName: o.customer_name,
        salesmanId: o.salesman_id,
        salesmanName: o.salesman_name,
        supplyPersonId: o.supply_person_id,
        supplyPersonName: o.supply_person_name,
        routeName: o.route_name,
        status: o.status,
        itemCount: o.item_count,
        quantityBase: o.quantity_base,
        grossAmount: fromPaisas(o.subtotal_paisas),
        discount: fromPaisas(o.line_discount_paisas + o.bill_discount_paisas),
        netAmount: fromPaisas(o.grand_total_paisas),
        cashReceived: fromPaisas(o.cash_received_paisas || 0),
        remainingBalance: fromPaisas(o.remaining_balance_paisas || 0),
      })),
      ...invRows.map((i) => ({
        id: i.id,
        transactionNumber: i.transaction_number,
        transactionType: 'DIRECT_SALE' as const,
        date: i.date,
        customerId: i.customer_id,
        customerName: i.customer_name,
        salesmanId: i.salesman_id,
        salesmanName: i.salesman_name,
        supplyPersonId: i.supply_person_id,
        supplyPersonName: i.supply_person_name,
        routeName: i.route_name,
        status: i.status,
        itemCount: i.item_count,
        quantityBase: i.quantity_base,
        grossAmount: fromPaisas(i.subtotal_paisas),
        discount: fromPaisas(i.line_discount_paisas + i.bill_discount_paisas),
        netAmount: fromPaisas(i.grand_total_paisas),
        cashReceived: fromPaisas(i.cash_received_paisas || 0),
        remainingBalance: fromPaisas(i.remaining_balance_paisas || 0),
      })),
      ...retRows.map((r) => ({
        id: r.id,
        transactionNumber: r.transaction_number,
        transactionType: 'RETURN' as const,
        date: r.date,
        customerId: r.customer_id,
        customerName: r.customer_name,
        salesmanId: r.salesman_id,
        salesmanName: r.salesman_name,
        supplyPersonId: r.supply_person_id,
        supplyPersonName: r.supply_person_name,
        routeName: r.route_name,
        status: r.status,
        itemCount: r.item_count,
        quantityBase: r.quantity_base,
        grossAmount: fromPaisas(r.subtotal_paisas),
        discount: 0,
        netAmount: -fromPaisas(r.grand_total_paisas),
        cashReceived: 0,
        remainingBalance: 0,
      })),
    ];

    transactionRows.sort((a, b) => (b.date > a.date ? 1 : -1));

    // 12. Overall Summary Totals
    let totalGrossSalesPaisas = 0;
    let totalDiscountPaisas = 0;
    let totalNetSalesPaisas = 0;
    let totalReturnsAmountPaisas = 0;
    let totalCollectionsPaisas = 0;
    let totalQuantitySoldBase = 0;

    for (const r of salespersonRows) {
      totalGrossSalesPaisas += r.grossSalesPaisas;
      totalDiscountPaisas += r.totalDiscountPaisas;
      totalNetSalesPaisas += r.netSalesPaisas;
      totalReturnsAmountPaisas += r.returnsAmountPaisas;
      totalCollectionsPaisas += r.collectionsPaisas;
      totalQuantitySoldBase += r.quantitySoldBase;
    }

    let totalDeliveries = 0;
    let totalQuantityDeliveredBase = 0;
    for (const r of supplyPersonRows) {
      totalDeliveries += r.ordersDeliveredCount + r.invoicesCount;
      totalQuantityDeliveredBase += r.quantityDeliveredBase;
    }

    const totalNetAfterReturns = fromPaisas(Math.max(0, totalNetSalesPaisas - totalReturnsAmountPaisas));

    return {
      fromDate,
      toDate,
      summary: {
        totalSalesmen: salespersonRows.filter((r) => r.staffId !== null).length,
        totalOrders: orderRows.length,
        totalInvoices: invRows.length,
        totalQuantitySoldBase,
        totalGrossSales: fromPaisas(totalGrossSalesPaisas),
        totalDiscounts: fromPaisas(totalDiscountPaisas),
        totalNetSales: fromPaisas(totalNetSalesPaisas),
        totalReturnsAmount: fromPaisas(totalReturnsAmountPaisas),
        totalNetAfterReturns,
        totalCollections: fromPaisas(totalCollectionsPaisas),
        totalDeliveries,
        totalQuantityDeliveredBase,
      },
      salespersonRows,
      supplyPersonRows,
      itemRows,
      customerRows,
      transactionRows,
    };
  }
}
